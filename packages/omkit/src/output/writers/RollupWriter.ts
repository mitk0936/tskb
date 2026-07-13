import { writeFile } from "node:fs/promises";
import { renderRef } from "../../foundation/ActionRef.ts";
import type { LogEntry } from "../../foundation/LogEntry.ts";
import { entryLine } from "./entryLine.ts";
import type { NodeView } from "./views.ts";

/**
 * A cross-cutting rollup: entries matching one facet (e.g. `level === "event"`), in
 * **global sequence order**. A little action header is inserted whenever the
 * emitting action changes, so the file reads as a chronological timeline of that
 * facet across the run — not grouped per action. `footer`, if given, is appended.
 */
export async function writeRollup(
  file: string,
  nodes: readonly NodeView[],
  entries: readonly LogEntry[],
  match: (e: LogEntry) => boolean,
  footer?: string
): Promise<void> {
  const refByNode = new Map(nodes.map((n) => [n.id, n]));
  const chunks: string[] = [];
  let lastNode: string | null = null;

  for (const e of entries) {
    if (!match(e)) continue;
    if (e.nodeId !== lastNode) {
      if (chunks.length) chunks.push(""); // blank line before the next action's header
      const ref = refByNode.get(e.nodeId);
      chunks.push(`# ${ref ? renderRef(ref) : e.path}`);
      lastNode = e.nodeId;
    }
    chunks.push(entryLine(e));
  }
  if (footer) chunks.push("", footer);
  await writeFile(file, `${chunks.join("\n")}\n`, "utf8");
}
