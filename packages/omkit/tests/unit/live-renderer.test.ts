import { describe, expect, test } from "vitest";
import { LiveRenderer, type LiveTerminal } from "../../src/output/LiveRenderer.ts";
import type { LogStore } from "../../src/output/log/LogStore.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const entry = (level: string, source: string, message: string, path = "main"): LogEntry =>
  ({ nodeId: path, path, level, source, message }) as unknown as LogEntry;

const fakeStore = (entries: LogEntry[]): LogStore =>
  ({
    subscribe: () =>
      (async function* () {
        for (const e of entries) yield e;
      })(),
  }) as unknown as LogStore;

const capture = (isTTY: boolean, columns?: number) => {
  const writes: string[] = [];
  const term: LiveTerminal = { write: (t) => writes.push(t), isTTY, columns };
  return { term, writes };
};

const CLEAR = /^\r\x1b\[2K/;

describe("LiveRenderer", () => {
  test("non-TTY appends every milestone on its own line (no control codes)", async () => {
    const { term, writes } = capture(false);
    await new LiveRenderer(term).run(
      fakeStore([entry("child", "launch", "→ probe_1 · log"), entry("event", "e", "ping")])
    );
    expect(writes).toEqual(["▶ main/probe_1\n", "⚡ main · ping\n"]);
  });

  test("TTY rewrites one status line in place, then a closing newline", async () => {
    const { term, writes } = capture(true, 80);
    await new LiveRenderer(term).run(
      fakeStore([entry("child", "launch", "→ probe_1 · log"), entry("event", "e", "ping")])
    );
    // Every write but the last clears the line first; none carry an interior newline.
    expect(writes.slice(0, -1).every((w) => CLEAR.test(w))).toBe(true);
    expect(writes.filter((w) => w.includes("\n"))).toEqual(["\n"]); // only the final newline
    expect(writes.at(-2)).toContain("⚡ main · ping"); // last status shown
    expect(writes.at(-1)).toBe("\n");
  });

  test("TTY commits an error (persisted with a newline), transient continues", async () => {
    const { term, writes } = capture(true, 80);
    await new LiveRenderer(term).run(
      fakeStore([entry("event", "e", "ping"), entry("error", "error", "boom\nmore")])
    );
    const committed = writes.find((w) => w.includes("✗ main · boom"));
    expect(committed).toBeDefined();
    expect(committed?.endsWith("\n")).toBe(true);
    expect(committed).not.toContain("more"); // only the first line of the error
  });

  test("TTY shows a node's tags next to its name once it's been tagged", async () => {
    const { term, writes } = capture(true, 200);
    await new LiveRenderer(term).run(
      fakeStore([
        entry("tag", "tag", "explorer:ready:gate", "main/healthcheck_1"),
        entry("event", "e", "ping", "main/healthcheck_1"),
      ])
    );
    const status = writes.find((w) => w.includes("⚡"));
    expect(status).toContain("main/healthcheck_1 [explorer:ready:gate] · ping");
  });

  test("TTY truncates a long transient line to the terminal width", async () => {
    const { term, writes } = capture(true, 20);
    await new LiveRenderer(term).run(fakeStore([entry("event", "e", "x".repeat(100))]));
    const visible = writes[0].replace(CLEAR, "");
    expect(visible.length).toBeLessThanOrEqual(20);
    expect(visible.endsWith("…")).toBe(true);
  });
});
