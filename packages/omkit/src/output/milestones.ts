import type { LogEntry } from "../foundation/LogEntry.ts";

/** A curated milestone line plus whether it must persist (vs. a transient status update). */
export interface Rendered {
  text: string;
  persist: boolean;
}

const firstLine = (message: string): string => message.split("\n", 1)[0] ?? message;

/** ✓ ok · ⊘ cancelled (a clean stop) · ✗ failed. */
const doneIcon = (status: string): string =>
  status === "ok" ? "✓" : status === "cancelled" ? "⊘" : "✗";

/** The node's path with its accumulated tags appended: `main/probe_9f3c [ready, gate]`. */
const named = (path: string, tags?: readonly string[]): string =>
  tags && tags.length ? `${path} [${tags.join(", ")}]` : path;

/** Map a curated log entry to a milestone line (and whether it persists), or `null` to drop it. */
export function format(e: LogEntry, tags?: readonly string[]): Rendered | null {
  if (e.level === "child" && e.source === "launch") {
    const child = e.message.replace(/^→\s*/, "").split(" · ")[0];
    return { text: `▶ ${e.path}/${child}`, persist: false };
  }
  if (e.level === "event" && e.source === "lifecycle") {
    if (e.message === "launched") return null;
    const status = e.message.replace(/^done · /, "");
    return {
      text: `${doneIcon(status)} ${named(e.path, tags)} · ${status}`,
      persist: status === "failed",
    };
  }
  if (e.level === "run") return { text: `· ${e.message}`, persist: true };
  if (e.level === "error" && e.source === "error") {
    return { text: `✗ ${named(e.path, tags)} · ${firstLine(e.message)}`, persist: true };
  }
  if (e.level === "event" && e.source === "cancel") {
    return { text: `⊘ ${named(e.path, tags)} · ${e.message}`, persist: true };
  }
  if (e.level === "event") {
    return { text: `⚡ ${named(e.path, tags)} · ${e.message}`, persist: false };
  }
  if (e.level === "assert") {
    return { text: `  ${named(e.path, tags)} · ${e.message}`, persist: e.message.includes("⊭") };
  }
  if (e.level === "snapshot") {
    return { text: `📸 ${named(e.path, tags)} · ${e.message}`, persist: false };
  }
  return null;
}
