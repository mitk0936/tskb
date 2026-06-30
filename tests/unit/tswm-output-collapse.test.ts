import { describe, expect, test } from "vitest";
import type { LogEntry } from "../../packages/tswm/src/core/log-collector/LogsCollector.ts";
import {
  COLLAPSE_HEAD,
  COLLAPSE_THRESHOLD,
  createRenderer,
  renderCollapsed,
  segmentForFile,
} from "../../packages/tswm/src/core/log-collector/render.ts";

let seq = 0;
const entry = (source: string, message: string, level = "info"): LogEntry => ({
  sequence: ++seq,
  timestamp: 0,
  source,
  level,
  message,
});

/** `n` output lines from one source. */
const lines = (source: string, n: number): LogEntry[] =>
  Array.from({ length: n }, (_, i) => entry(source, `${source} line ${i + 1}`));

describe("segmentForFile", () => {
  test("a run at the threshold renders identically to the streaming renderer", () => {
    const entries = lines("build", COLLAPSE_THRESHOLD); // not > threshold → no collapse
    const items = segmentForFile(entries);

    expect(items.every((i) => i.kind === "line")).toBe(true);

    const render = createRenderer();
    const expected = entries.map(render).join("\n");
    const actual = items.map((i) => (i.kind === "line" ? i.text : "")).join("\n");
    expect(actual).toBe(expected);
  });

  test("a run longer than the threshold collapses into one descriptor carrying every line", () => {
    const n = COLLAPSE_THRESHOLD + 5;
    const items = segmentForFile(lines("build", n));

    expect(items).toHaveLength(1);
    expect(items[0].kind).toBe("collapsed");
    if (items[0].kind !== "collapsed") throw new Error("unreachable");
    expect(items[0].run.source).toBe("build");
    expect(items[0].run.lines).toHaveLength(n);
  });

  test("a milestone splits a long run so neither half collapses", () => {
    const entries = [
      ...lines("build", 10),
      entry("event", "build · tick", "event"),
      ...lines("build", 10),
    ];
    const items = segmentForFile(entries);
    expect(items.some((i) => i.kind === "collapsed")).toBe(false);
  });
});

describe("renderCollapsed", () => {
  test("shows the head lines under the source header, then a pointer with the hidden count", () => {
    const run = {
      source: "build",
      lines: Array.from({ length: 20 }, (_, i) => `line ${i + 1}`),
    };
    const out = renderCollapsed(run, {
      head: COLLAPSE_HEAD,
      rel: "logs/x/output-build-01.log",
    }).split("\n");

    expect(out[0]).toBe("▸ build");
    expect(out[1]).toBe("\tline 1");
    expect(out[COLLAPSE_HEAD]).toBe(`\tline ${COLLAPSE_HEAD}`);
    const pointer = out[COLLAPSE_HEAD + 1];
    expect(pointer).toContain(`+${20 - COLLAPSE_HEAD} more lines`);
    expect(pointer).toContain("logs/x/output-build-01.log");
  });
});
