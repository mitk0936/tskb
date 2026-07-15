import type { LogEntry } from "../foundation/LogEntry.ts";
import type { LogStore } from "./log/LogStore.ts";

/** The terminal surface the renderer writes to (process.stdout satisfies it). */
export interface LiveTerminal {
  write(text: string): unknown;
  readonly isTTY?: boolean;
  readonly columns?: number;
}

/** Return to column 0 and clear the whole line — the in-place status-line reset. */
const CLEAR = "\r\x1b[2K";

/**
 * Renders a **curated** stream of milestones to the terminal, live — action launches,
 * completions, and errors, plus events, asserts, and snapshots. The bulk output (console
 * lines, proc stdout/stderr) is intentionally *not* shown live; it lives in the per-action
 * `.log` files.
 *
 * On a TTY it keeps a **single status line**, rewriting it in place as milestones arrive,
 * so the terminal stays quiet — except lines worth keeping (errors, failures, run
 * milestones), which are *committed* (printed with a newline) so they persist above the
 * live line. Piped/redirected output (no TTY) falls back to appending every line, so logs
 * stay readable. Writes through `process.stdout` directly, which `patch-console` doesn't
 * intercept, so it can't feed back into console capture.
 */
export class LiveRenderer {
  /** True while a transient status line is on screen (needs clearing or a closing newline). */
  private pending = false;
  /** Tags accumulated per node from `tag` entries, so milestones can show them by the name. */
  private readonly tagsByNode = new Map<string, string[]>();

  constructor(private readonly term: LiveTerminal) {}

  async run(store: LogStore): Promise<void> {
    const tty = Boolean(this.term.isTTY);
    for await (const entry of store.subscribe({ replay: true })) {
      if (entry.level === "tag" && entry.source === "tag") {
        const list = this.tagsByNode.get(entry.nodeId) ?? [];
        list.push(entry.message);
        this.tagsByNode.set(entry.nodeId, list);
        continue; // tags aren't their own line — they decorate the node's milestones
      }
      const rendered = format(entry, this.tagsByNode.get(entry.nodeId));
      if (rendered === null) continue;

      if (!tty) {
        this.term.write(`${rendered.text}\n`); // no TTY: append, one line each
        continue;
      }
      if (rendered.persist) {
        // Commit a line that must survive: finish the transient line, then print permanently.
        this.term.write(`${this.pending ? CLEAR : ""}${rendered.text}\n`);
        this.pending = false;
      } else {
        // Transient: overwrite the current status line in place, truncated to fit.
        this.term.write(`${CLEAR}${truncate(rendered.text, this.term.columns)}`);
        this.pending = true;
      }
    }
    // Keep the last status line on screen for the summary that follows.
    if (this.pending) {
      this.term.write("\n");
      this.pending = false;
    }
  }
}

/** A curated line plus whether it must persist (committed) or is a transient status update. */
interface Rendered {
  text: string;
  persist: boolean;
}

const firstLine = (message: string): string => message.split("\n", 1)[0] ?? message;

/** ✓ ok · ⊘ cancelled (a clean stop) · ✗ failed. */
const doneIcon = (status: string): string =>
  status === "ok" ? "✓" : status === "cancelled" ? "⊘" : "✗";

/** Truncate to the terminal width so an in-place line never wraps and breaks the `\r`. */
const truncate = (text: string, columns?: number): string =>
  !columns || text.length < columns ? text : `${text.slice(0, Math.max(0, columns - 1))}…`;

/** The node's path with its accumulated tags appended: `main/probe_9f3c [ready, gate]`. */
const named = (path: string, tags?: readonly string[]): string =>
  tags && tags.length ? `${path} [${tags.join(", ")}]` : path;

/** Map a curated entry to a terminal line (and whether it persists), or `null` to drop it. */
const format = (e: LogEntry, tags?: readonly string[]): Rendered | null => {
  // Action launch — bubbled onto the parent as `→ <childId> · <log>`.
  if (e.level === "child" && e.source === "launch") {
    const child = e.message.replace(/^→\s*/, "").split(" · ")[0];
    return { text: `▶ ${e.path}/${child}`, persist: false };
  }
  // Lifecycle events: `launched` is already shown via the launch pointer above, so drop
  // the duplicate; `done · <status>` renders with the status icon — a failure persists.
  if (e.level === "event" && e.source === "lifecycle") {
    if (e.message === "launched") return null;
    const status = e.message.replace(/^done · /, "");
    return {
      text: `${doneIcon(status)} ${named(e.path, tags)} · ${status}`,
      persist: status === "failed",
    };
  }
  // Run milestones (started / tearing down / finished) — few, and worth keeping.
  if (e.level === "run") return { text: `· ${e.message}`, persist: true };
  // An action's *own* failure — not proc stderr, console.error, or a teardown cancellation.
  if (e.level === "error" && e.source === "error") {
    return { text: `✗ ${named(e.path, tags)} · ${firstLine(e.message)}`, persist: true };
  }
  // A cancellation milestone (⊘) — persist it so it doesn't flash away during teardown.
  if (e.level === "event" && e.source === "cancel")
    return { text: `⊘ ${named(e.path, tags)} · ${e.message}`, persist: true };
  // User-emitted events.
  if (e.level === "event")
    return { text: `⚡ ${named(e.path, tags)} · ${e.message}`, persist: false };
  // Asserts: a failed one (⊭) persists, a pass is transient.
  if (e.level === "assert")
    return { text: `  ${named(e.path, tags)} · ${e.message}`, persist: e.message.includes("⊭") };
  if (e.level === "snapshot")
    return { text: `📸 ${named(e.path, tags)} · ${e.message}`, persist: false };
  // Everything else (info / console / proc output / tag / bubbled child events) → files only.
  return null;
};
