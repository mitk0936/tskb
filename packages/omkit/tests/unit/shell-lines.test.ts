import { describe, expect, test } from "vitest";
import { recapLines, shellLine } from "../../src/cli/ui/views/shellLines.ts";
import { RunModel } from "../../src/output/RunModel.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

let seq = 0;
const entry = (path: string, level: string, source: string, message: string, ts = 0): LogEntry =>
  ({ sequence: seq++, ts, nodeId: path, path, level, source, message }) as LogEntry;

/** Feed entries through a model and collect the scrollback lines the shell would write. */
function scrollback(entries: LogEntry[], tearingDown = false): string[] {
  const model = new RunModel();
  const out: string[] = [];
  for (const e of entries) {
    model.apply(e);
    const line = shellLine(e, model.node(e.nodeId), tearingDown);
    if (line) out.push(line.text);
  }
  return out;
}

describe("shellLine", () => {
  test("keeps outcomes — finished nodes with their duration — and drops what was only happening", () => {
    const lines = scrollback([
      entry("main", "run", "run", "run started · tskb-build-9cc20a18"),
      entry("main", "child", "launch", "→ Build-Docs_0ace8d29 · …"),
      entry("main/Build-Docs_0ace8d29", "event", "lifecycle", "launched", 1_000),
      entry("main/Build-Docs_0ace8d29", "tag", "tag", "build"),
      entry("main/Build-Docs_0ace8d29", "info", "console", "build-docs · start"),
      entry("main/watchDir_2b95b7aa", "event", "ready", "ready · D:\\tskb\\.tskb"),
      entry("main", "snapshot", "snapshot", "build-config → …"),
      entry("main/Build-Docs_0ace8d29", "event", "lifecycle", "done · ok", 3_100),
      entry("main/watchDir_2b95b7aa", "event", "update", "update · graph/docs.json"),
      entry("main", "event", "lifecycle", "done · ok"),
      entry("main", "run", "run", "finished"),
    ]);
    expect(lines).toEqual(["  ✓ Build-Docs [build] · 2.1s"]);
  });

  test("failures, errors and failed asserts always make it", () => {
    const lines = scrollback([
      entry("main/probe_12345678", "event", "lifecycle", "launched", 0),
      entry("main/probe_12345678", "error", "error", "Error: connect ECONNREFUSED\n    at …"),
      entry("main/probe_12345678", "event", "lifecycle", "done · failed", 500),
      entry("main", "assert", "assert", "⊨ PASS · up"),
      entry("main", "assert", "assert", "⊭ FAIL · math broken"),
    ]);
    expect(lines).toEqual([
      "  ✗ probe · Error: connect ECONNREFUSED",
      "  ✗ probe · failed · 500ms",
      "  ✗ om · ⊭ FAIL · math broken",
    ]);
  });

  test("a cancellation mid-run is noted; the ones a teardown causes are not", () => {
    const cancelled = [entry("main/watchDir_2b95b7aa", "event", "lifecycle", "done · cancelled")];
    expect(scrollback(cancelled)).toEqual(["  ⊘ watchDir · cancelled"]);
    expect(scrollback(cancelled, true)).toEqual([]);
  });

  test("a node's events become its latest line in the live tree instead", () => {
    const model = new RunModel();
    model.apply(entry("main/watchDir_2b95b7aa", "event", "update", "update · graph/terms.json"));
    expect(model.node("main/watchDir_2b95b7aa")?.last).toBe("update · graph/terms.json");
  });
});

describe("recapLines", () => {
  const summary = (tally: string) => [
    "om → /runs/a",
    "  main log  → /runs/a/main.log",
    `  asserts   → /runs/a/asserts.log   ${tally}`,
    "  report    → /runs/a/report.html",
  ];

  test("cuts the recap to main.log and the report, plus the assert tally when there were asserts", () => {
    expect(recapLines(summary("⊨ 0 passed · ⊭ 0 failed")).map((l) => l.text)).toEqual([
      "  main log  → /runs/a/main.log",
      "  report    → /runs/a/report.html",
    ]);
    const failing = recapLines(summary("⊨ 3 passed · ⊭ 1 failed"));
    expect(failing.map((l) => l.text)).toEqual([
      "  main log  → /runs/a/main.log",
      "  asserts   ⊨ 3 passed · ⊭ 1 failed",
      "  report    → /runs/a/report.html",
    ]);
    expect(failing[1]!.color).toBe("red");
  });

  test("keeps a crashed child's output whole — it is the only account of what went wrong", () => {
    const crash = ["the run ended before it could report:", "Error: Cannot find module 'x'"];
    expect(recapLines(crash).map((l) => l.text)).toEqual([
      "  the run ended before it could report:",
      "  Error: Cannot find module 'x'",
    ]);
  });
});
