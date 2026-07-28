import { describe, expect, test } from "vitest";
import { RunModel, MILESTONE_CAP } from "../../src/output/RunModel.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const entry = (level: string, source: string, message: string, path = "main"): LogEntry =>
  ({ nodeId: path, path, level, source, message }) as unknown as LogEntry;

describe("RunModel — milestone lines", () => {
  test("renders the same milestone text as the formatter, tags included", () => {
    const m = new RunModel();
    m.apply(entry("tag", "tag", "explorer:ready", "main/hc"));
    const r = m.apply(entry("event", "e", "ping", "main/hc"));
    expect(r?.text).toBe("⚡ main/hc [explorer:ready] · ping");
    expect(m.milestones()).toEqual(["⚡ main/hc [explorer:ready] · ping"]);
  });

  test("a tag entry produces no line", () => {
    const m = new RunModel();
    expect(m.apply(entry("tag", "tag", "ready", "main/hc"))).toBeNull();
    expect(m.milestones()).toEqual([]);
  });

  test("the milestone tail is capped — oldest lines fall off", () => {
    const m = new RunModel();
    for (let i = 0; i < MILESTONE_CAP + 50; i++) m.apply(entry("event", "e", `ping-${i}`));
    const tail = m.milestones();
    expect(tail).toHaveLength(MILESTONE_CAP);
    expect(tail[0]).toContain("ping-50"); // the first 50 were dropped
    expect(tail[tail.length - 1]).toContain(`ping-${MILESTONE_CAP + 49}`);
  });
});

describe("RunModel — node model", () => {
  test("tracks per-node status from lifecycle and cancel entries", () => {
    const m = new RunModel();
    m.apply(entry("event", "lifecycle", "launched", "main/dev"));
    m.apply(entry("event", "lifecycle", "done · ok", "main/build"));
    m.apply(entry("event", "lifecycle", "done · failed", "main/probe"));
    m.apply(entry("event", "cancel", "cancelled", "main/daemon"));

    const byPath = Object.fromEntries(m.nodes().map((n) => [n.path, n.status]));
    expect(byPath).toEqual({
      "main/dev": "running",
      "main/build": "ok",
      "main/probe": "failed",
      "main/daemon": "cancelled",
    });
  });

  test("summary rolls up counts and lists running nodes, most-recent first", () => {
    const m = new RunModel();
    m.apply(entry("event", "lifecycle", "launched", "main"));
    m.apply(entry("event", "lifecycle", "done · ok", "main/build"));
    m.apply(entry("event", "lifecycle", "launched", "main/dev"));

    const s = m.summary();
    expect(s.ok).toBe(1);
    expect(s.failed).toBe(0);
    expect(s.running).toEqual(["main/dev", "main"]); // dev touched most recently
  });

  test("attaches tags to their node", () => {
    const m = new RunModel();
    m.apply(entry("tag", "tag", "ready", "main/dev"));
    m.apply(entry("tag", "tag", "gate", "main/dev"));
    expect(m.nodes().find((n) => n.path === "main/dev")?.tags).toEqual(["ready", "gate"]);
  });
});
