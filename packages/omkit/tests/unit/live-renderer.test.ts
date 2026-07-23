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

const capture = () => {
  const writes: string[] = [];
  const term: LiveTerminal = { write: (t) => writes.push(t) };
  return { term, writes };
};

describe("LiveRenderer", () => {
  test("appends every milestone on its own line (no control codes)", async () => {
    const { term, writes } = capture();
    await new LiveRenderer(term).run(
      fakeStore([entry("child", "launch", "→ probe_1 · log"), entry("event", "e", "ping")])
    );
    expect(writes).toEqual(["▶ main/probe_1\n", "⚡ main · ping\n"]);
  });

  test("shows a node's tags next to its name once tagged", async () => {
    const { term, writes } = capture();
    await new LiveRenderer(term).run(
      fakeStore([
        entry("tag", "tag", "explorer:ready", "main/hc_1"),
        entry("event", "e", "ping", "main/hc_1"),
      ])
    );
    expect(writes).toEqual(["⚡ main/hc_1 [explorer:ready] · ping\n"]);
  });

  test("an error is appended as its first line only", async () => {
    const { term, writes } = capture();
    await new LiveRenderer(term).run(fakeStore([entry("error", "error", "boom\nmore")]));
    expect(writes).toEqual(["✗ main · boom\n"]);
  });
});
