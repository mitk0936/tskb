import type { LogEntry } from "../../../foundation/LogEntry.ts";
import type { RunNode } from "../../../output/RunModel.ts";
import { formatDuration, nodeLabel } from "./RunView.tsx";
import type { ScrollLine } from "./Scrollback.tsx";

const firstLine = (message: string): string => message.split("\n", 1)[0] ?? message;

/**
 * The shell's scrollback line for one log entry, or `null` to keep it out.
 *
 * The scrollback is a record of outcomes, not a transcript: a node that finished (with how long
 * it took), a failure, an error, a failed assert. What is merely happening — launches, events,
 * output, snapshots, the run's own narration — shows in the live box while it happens and is in
 * the run's logs and report afterwards. The root's own end is left to the verdict line, and
 * once the run is tearing down the cancellations that teardown causes are expected, so they are
 * left to the verdict too.
 */
export function shellLine(
  e: LogEntry,
  node: RunNode | undefined,
  tearingDown: boolean
): ScrollLine | null {
  if (!node) return null;
  const label = nodeLabel(node);
  const isRoot = !node.path.includes("/");
  if (e.level === "event" && e.source === "lifecycle" && e.message.startsWith("done · ")) {
    if (isRoot) return null;
    const took =
      node.endedAt === undefined ? "" : ` · ${formatDuration(node.endedAt - node.startedAt)}`;
    if (node.status === "ok") return { text: `  ✓ ${label}${took}`, color: "green" };
    if (node.status === "failed") return { text: `  ✗ ${label} · failed${took}`, color: "red" };
    return tearingDown ? null : { text: `  ⊘ ${label} · cancelled`, dim: true };
  }
  if (e.level === "error" && e.source === "error") {
    return { text: `  ✗ ${isRoot ? "om" : label} · ${firstLine(e.message)}`, color: "red" };
  }
  if (e.level === "assert" && e.message.includes("⊭")) {
    return { text: `  ✗ ${isRoot ? "om" : label} · ${e.message}`, color: "red" };
  }
  return null;
}

/**
 * The verdict's recap, cut to what you reach for next: `main.log` and the report, and the assert
 * tally when the run asserted anything. The full block (every sibling log) is in the run folder
 * and at the foot of `main.log`. A summary of any other shape — the output of a child that died before it could
 * report — is the only account of what went wrong, so it is kept whole.
 */
export function recapLines(summary: readonly string[]): ScrollLine[] {
  if (!summary[0]?.startsWith("om → ")) {
    return summary.map((line) => ({ text: `  ${line}`, dim: true }));
  }
  const lines: ScrollLine[] = [];
  for (const line of summary) {
    const trimmed = line.trim();
    if (trimmed.startsWith("main log ") || trimmed.startsWith("report ")) {
      lines.push({ text: `  ${trimmed}`, dim: true });
    }
    const tally = /⊨ (\d+) passed · ⊭ (\d+) failed/.exec(trimmed);
    if (tally && Number(tally[1]) + Number(tally[2]) > 0) {
      lines.push({
        text: `  asserts   ${tally[0]}`,
        color: Number(tally[2]) ? "red" : undefined,
        dim: !Number(tally[2]),
      });
    }
  }
  return lines;
}
