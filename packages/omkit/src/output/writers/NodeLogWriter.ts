import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderRef } from "../../foundation/ActionRef.ts";
import type { LogEntry } from "../../foundation/LogEntry.ts";
import { entryLine, groupByNode } from "./entryLine.ts";
import type { NodeView } from "./views.ts";

/**
 * Writes each node's own human `.log`: a one-time `ActionRef` header, then that
 * node's entries (by `nodeId`) prefixed `[seq iso-ts path]`. Rows never repeat
 * name/tags — the header carries them.
 */
export async function writeNodeLogs(
  nodes: readonly NodeView[],
  entries: readonly LogEntry[]
): Promise<void> {
  const byNode = groupByNode(entries, () => true);
  await Promise.all(
    nodes.map(async (node) => {
      const lines = (byNode.get(node.id) ?? []).map(entryLine);
      const body = [...header(node), "", ...lines, ""].join("\n");
      await mkdir(path.dirname(node.logFile), { recursive: true });
      await writeFile(node.logFile, body, "utf8");
    })
  );
}

/** The per-file metadata header: ref, args, start/finish times, duration, status. */
const header = (node: NodeView): string[] => [
  `# ${renderRef(node)}`,
  `#   log:      ${node.logFile}`,
  `#   args:     ${renderArgs(node.args)}`,
  `#   started:  ${stamp(node.startedAt)}`,
  `#   finished: ${stamp(node.endedAt)} (${node.duration}ms)`,
  `#   status:   ${node.status}`,
];

const stamp = (ms: number): string => (ms ? new Date(ms).toISOString() : "-");

const renderArgs = (args: readonly unknown[]): string => {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
};
