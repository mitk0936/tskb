import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

/**
 * A run's `result.json` carries `value`: whatever the om body returned. This is how an
 * action-backed MCP tool hands its result back — the host om returns the action's value —
 * so a caller reads it from the verdict instead of hunting through snapshots.
 */
describe("a run's value", () => {
  test("is what the om body returned", async () => {
    await om("value-basic").run(async () => ({ answer: 42, tags: ["a", "b"] }));
    expect(ExecutionTree.last!.runViewForTest().value).toEqual({ answer: 42, tags: ["a", "b"] });
  });

  test("travels through .args() too", async () => {
    process.env.OMKIT_ARGS = JSON.stringify({ rows: 3 });
    try {
      await om("value-args")
        .args(z.object({ rows: z.number() }))
        .run(async (_ctx, { rows }) => rows * 2);
    } finally {
      delete process.env.OMKIT_ARGS;
    }
    expect(ExecutionTree.last!.runViewForTest().value).toBe(6);
  });

  test("is absent when the body returns nothing", async () => {
    await om("value-none").run(async () => {});
    expect("value" in ExecutionTree.last!.runViewForTest()).toBe(false);
  });

  test("is dropped, not fatal, when it cannot be serialised", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await om("value-cyclic").run(async () => cyclic);
    const view = ExecutionTree.last!.runViewForTest();
    expect(view.ok).toBe(true);
    expect("value" in view).toBe(false);
    // The guard round-trips through JSON, so the view itself must stringify cleanly.
    expect(() => JSON.stringify(view)).not.toThrow();
  });
});
