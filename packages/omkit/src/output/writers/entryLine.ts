import type { LogEntry } from "../../foundation/LogEntry.ts";

/**
 * The shared human-readable row: `[<seq>] <body>`. Only the run-global sequence
 * prefixes the line (date/path live in the file header + `raw.jsonl`). Event,
 * snapshot, and assert lines carry a leading icon; everything else keeps its
 * `source` (proc name, child id, `console`, …).
 */
export const entryLine = (e: LogEntry): string => `[${e.sequence}] ${bodyOf(e)}`;

const bodyOf = (e: LogEntry): string => {
  switch (e.level) {
    case "event":
      return `⚡ ${e.message}`;
    case "snapshot":
      return `📸 ${e.message}`;
    case "assert":
      return e.message; // already ⊨/⊭-prefixed
    // Plain output (console.log, proc stdout) — no action-name prefix, just a quiet marker.
    case "info":
      return `▪ ${e.message}`;
    case "error":
      // An action's *own* failure keeps a ✗; proc stderr / console.error is plain
      // output. (Cancellation no longer logs at this level — it's a clean stop.)
      return e.source === "error" ? `✗ ${e.message}` : `▪ ${e.message}`;
    // run/done milestones, tags, and bubbled child lines keep their `source` label.
    default:
      return `${e.source} · ${e.message}`;
  }
};

/** Group entries by `nodeId` (preserving order), keeping only those that `match`. */
export const groupByNode = (
  entries: readonly LogEntry[],
  match: (e: LogEntry) => boolean
): Map<string, LogEntry[]> => {
  const byNode = new Map<string, LogEntry[]>();
  for (const e of entries) {
    if (!match(e)) continue;
    const list = byNode.get(e.nodeId) ?? [];
    list.push(e);
    byNode.set(e.nodeId, list);
  }
  return byNode;
};
