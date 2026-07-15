import { afterEach, describe, expect, test } from "vitest";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("action definedAt", () => {
  test("an action records file:line of its .run(...) site", () => {
    const a = action("probe").run(() => {});
    expect(a.definedAt).toMatch(/defined-at\.test\.ts:\d+$/);
  });

  test("the defining site flows onto the node view (its log header)", async () => {
    await om(async () => {
      await action("probe")
        .run(async () => {})()
        .exec().result;
    });
    const child = ExecutionTree.last!.runViewForTest().root.children[0];
    expect(child.definedAt).toMatch(/defined-at\.test\.ts:\d+$/);
  });

  test("the root node records the om() call site (the run's script)", async () => {
    await om(async () => {});
    expect(ExecutionTree.last!.runViewForTest().root.definedAt).toMatch(
      /defined-at\.test\.ts:\d+$/
    );
  });
});
