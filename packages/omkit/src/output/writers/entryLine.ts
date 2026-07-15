import { label, type ActionRef } from "../../foundation/ActionRef.ts";
import type { LogEntry } from "../../foundation/LogEntry.ts";

/** Resolve a node's reference (name + tags) by id, for naming a bubbled child. */
export type RefOf = (nodeId: string) => ActionRef | undefined;

/**
 * The shared human-readable row: `[<seq>] <body>`. Only the run-global sequence
 * prefixes the line (date/path live in the file header + `raw.jsonl`). Event,
 * snapshot, and assert lines carry a leading icon; a **bubbled child milestone** names
 * the child by its {@link label} (name + tags) via `refOf`; everything else keeps its
 * `source` (proc name, `console`, …).
 */
export const entryLine = (e: LogEntry, refOf?: RefOf): string => {
  // Bubbled child rows are nested a level in — the whole row, `[seq]` included.
  const indent = e.level === "child" ? "    " : "";
  return `${indent}[${e.sequence}] ${bodyOf(e, refOf)}`;
};

const bodyOf = (e: LogEntry, refOf?: RefOf): string => {
  switch (e.level) {
    case "event":
      // A cancellation milestone reads ⊘; other emitted events keep ⚡.
      return e.source === "cancel" ? `⊘ ${e.message}` : `⚡ ${e.message}`;
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
    case "child": {
      // A bubbled child line (indented at the row level by `entryLine`). The launch pointer
      // (`source === "launch"`) keeps its `→ id · logfile` message; a milestone names the
      // child by its label (name + tags) via `refOf`.
      if (e.source === "launch") return `${e.source} · ${e.message}`;
      const ref = refOf?.(e.source);
      return `${ref ? label(ref) : e.source} · ${e.message}`;
    }
    // run/done milestones, tags, … keep their `source` label.
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
