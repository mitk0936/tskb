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
export const entryLine = (e: LogEntry, refOf?: RefOf): string =>
  `${indentOf(e)}[${e.sequence}] ${bodyOf(e, refOf)}`;

/**
 * Bubbled child rows are nested in — the whole row, `[seq]` included. The launch pointer
 * sits one level in; the child's own milestones sit one level deeper, under their launch.
 */
const indentOf = (e: LogEntry): string => {
  if (e.level !== "child") return "";
  return e.source === "launch" ? "    " : "        ";
};

/** `→ <id> · <logfile> · …` → `ACTION_RUN(<id>) · → · <logfile> · …`, so a launch stands out. */
const launchBody = (message: string): string => {
  const [head = "", ...rest] = message.replace(/^→\s*/, "").split(" · ");
  return [`ACTION_RUN(${head})`, "→", ...rest].join(" · ");
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
      // A bubbled child line (indented at the row level by `indentOf`). The launch pointer
      // (`source === "launch"`) reads `launch ACTION_RUN(id) · → · logfile`; a milestone
      // names the child by its label (name + tags) via `refOf`.
      if (e.source === "launch") return `${e.source} ${launchBody(e.message)}`;
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
