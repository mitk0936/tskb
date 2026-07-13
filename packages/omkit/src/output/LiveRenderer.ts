import type { LogEntry } from "../foundation/LogEntry.ts";
import type { LogStore } from "./log/LogStore.ts";

/**
 * Renders a **curated** stream of milestones to the terminal, live — action
 * launches, completions, and errors, plus events, asserts, and snapshots. The bulk
 * output (console lines, proc stdout/stderr) is intentionally *not* shown live; it
 * lives in the per-action `.log` files. Writes through the pre-patch terminal
 * writer (so it can't feed back into console capture).
 */
export class LiveRenderer {
  constructor(private readonly write: (line: string) => void) {}

  async run(store: LogStore): Promise<void> {
    for await (const entry of store.subscribe({ replay: true })) {
      const line = format(entry);
      if (line !== null) this.write(line);
    }
  }
}

const firstLine = (message: string): string => message.split("\n", 1)[0] ?? message;

/** ✓ ok · ⊘ cancelled (a clean stop) · ✗ failed. */
const doneIcon = (status: string): string =>
  status === "ok" ? "✓" : status === "cancelled" ? "⊘" : "✗";

/** Map a curated entry to a terminal line, or `null` to drop it from the live view. */
const format = (e: LogEntry): string | null => {
  // Action launch — bubbled onto the parent as `→ <childId> · <log>`.
  if (e.level === "child" && e.source === "launch") {
    const child = e.message.replace(/^→\s*/, "").split(" · ")[0];
    return `▶ ${e.path}/${child}`;
  }
  // Lifecycle events: `launched` is already shown via the launch pointer above, so
  // drop the duplicate; `done · <status>` renders with the status icon.
  if (e.level === "event" && e.source === "lifecycle") {
    if (e.message === "launched") return null;
    const status = e.message.replace(/^done · /, "");
    return `${doneIcon(status)} ${e.path} · ${status}`;
  }
  // Run milestones (started / tearing down / finished).
  if (e.level === "run") return `· ${e.message}`;
  // An action's *own* failure — not proc stderr (source = proc name), console.error,
  // or a teardown cancellation (which is a clean stop, not an error).
  if (e.level === "error" && e.source === "error") {
    return `✗ ${e.path} · ${firstLine(e.message)}`;
  }
  // User-emitted events.
  if (e.level === "event") return `⚡ ${e.path} · ${e.message}`;
  if (e.level === "assert") return `  ${e.path} · ${e.message}`;
  if (e.level === "snapshot") return `📸 ${e.path} · ${e.message}`;
  // Everything else (info / console / proc output / tag / bubbled child events) → files only.
  return null;
};
