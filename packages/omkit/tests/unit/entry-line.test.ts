import { describe, expect, test } from "vitest";
import { entryLine, type RefOf } from "../../src/output/writers/entryLine.ts";
import type { ActionRef } from "../../src/foundation/ActionRef.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const e = (over: Partial<LogEntry>): LogEntry =>
  ({
    sequence: 1,
    ts: 0,
    nodeId: "n",
    path: "main/n",
    level: "info",
    source: "s",
    message: "m",
    ...over,
  }) as LogEntry;

const ref = (id: string, name: string, tags: string[]): ActionRef => ({
  id,
  name,
  path: `main/${id}`,
  tags,
});

describe("entryLine", () => {
  test("a bubbled child milestone is named by the child's label (name + tags)", () => {
    const refOf: RefOf = (id) =>
      id === "chromePage_9f3c" ? ref(id, "chromePage", ["browser:explorer"]) : undefined;
    const line = entryLine(
      e({ level: "child", source: "chromePage_9f3c", message: "✓ done · ok" }),
      refOf
    );
    expect(line).toBe("    [1] chromePage [browser:explorer] · ✓ done · ok"); // row indented under parent
  });

  test("a child with no tags shows just its name", () => {
    const refOf: RefOf = (id) => ref(id, "build", []);
    expect(entryLine(e({ level: "child", source: "x", message: "launched" }), refOf)).toBe(
      "    [1] build · launched"
    );
  });

  test("without a resolver, falls back to the raw source id", () => {
    expect(entryLine(e({ level: "child", source: "probe_1", message: "⚡ ping" }))).toBe(
      "    [1] probe_1 · ⚡ ping"
    );
  });

  test("the launch pointer keeps its `→ id · logfile` message (row indented)", () => {
    expect(entryLine(e({ level: "child", source: "launch", message: "→ probe_1 · /x.log" }))).toBe(
      "    [1] launch · → probe_1 · /x.log"
    );
  });

  test("non-child rows are unchanged", () => {
    expect(entryLine(e({ level: "event", message: "ping" }))).toBe("[1] ⚡ ping");
  });
});
