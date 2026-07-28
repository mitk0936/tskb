import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { renderRef } from "../../foundation/ActionRef.ts";
import type { LogEntry } from "../../foundation/LogEntry.ts";
import { entryLine, groupByNode } from "./entryLine.ts";
import type { NodeView } from "./views.ts";

/**
 * Writes each node's own human `.log`: a one-time `ActionRef` header, then that
 * node's entries (by `nodeId`) prefixed `[seq iso-ts path]`. Rows never repeat
 * name/tags — the header carries them. The optional `footer` (the run's end-of-run
 * recap — assert tally + sibling log paths) is appended to the **root** log only,
 * so `main.log` closes with the same snippet shown live on the terminal.
 */
export async function writeNodeLogs(
  nodes: readonly NodeView[],
  entries: readonly LogEntry[],
  footer: readonly string[] = []
): Promise<void> {
  const byNode = groupByNode(entries, () => true);
  const refByNode = new Map(nodes.map((n) => [n.id, n]));
  const refOf = (id: string): NodeView | undefined => refByNode.get(id);
  await Promise.all(
    nodes.map(async (node) => {
      const lines = (byNode.get(node.id) ?? []).map((e) => entryLine(e, refOf));
      const foot = node.parentId === null && footer.length ? ["", summaryRule, ...footer] : [];
      const body = [...header(node), "", ...lines, ...foot, ""].join("\n");
      await mkdir(path.dirname(node.logFile), { recursive: true });
      await writeFile(node.logFile, body, "utf8");
    })
  );
}

/** The divider that opens the root log's end-of-run recap (mirrors the header's `── legend ──`). */
const summaryRule = "── summary ──────────────────────────────────────────────────────────";

/** The per-file metadata header: ref, defining script, args, start/finish times, status. */
const header = (node: NodeView): string[] =>
  [
    `# ${renderRef(node)}`,
    `#   log:      ${node.logFile}`,
    node.definedAt ? `#   defined:  ${node.definedAt}` : null,
    `#   args:     ${renderArgs(node.args)}`,
    `#   started:  ${stamp(node.startedAt)}`,
    `#   finished: ${stamp(node.endedAt)} (${node.duration}ms)`,
    `#   status:   ${node.status}`,
    ...(node.parentId === null ? legend : []), // the run's root log (main.log) only
  ].filter((line): line is string => line !== null);

/** A compact reading guide, printed once on the root log so an agent can follow the run. */
const legend: string[] = [
  "#",
  "# ── legend ──────────────────────────────────────────────────────────",
  "#   [n]              global sequence — the merge/order key across every .log",
  "#   indented rows    a child action's milestones, bubbled up here",
  "#   name [tags]      the action and its tags   ·   defined …  where its code lives",
  "#   launch · → ….log a child started — open that file for its full output",
  "#   ⚡ event   ✓ done ok   ⊘ cancelled   ✗ failed   ⊨/⊭ assert pass/fail   📸 snapshot   ▪ output",
];

const stamp = (ms: number): string => (ms ? new Date(ms).toISOString() : "-");

const renderArgs = (args: readonly unknown[]): string => {
  try {
    return JSON.stringify(args);
  } catch {
    return String(args);
  }
};
