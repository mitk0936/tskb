import { afterEach, describe, expect, test } from "vitest";
import { z } from "zod";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

const noop = async (): Promise<void> => {};
const schema = z.object({ label: z.string().default("x") });
const longLived = { mode: "long-lived" } as const;

describe("om .mcp()", () => {
  // `.args()` returns a *new* builder. Spec A shipped `.describe()` being dropped across
  // exactly this link, and a single-direction test passes against that bug — so both
  // directions are pinned.
  test("survives the .args() link in both directions", async () => {
    await om("mcp-before-args").mcp(longLived).args(schema).run(noop);
    expect(ExecutionTree.last!.mcp).toEqual(longLived);
    ExecutionTree.reset();

    await om("mcp-after-args").args(schema).mcp(longLived).run(noop);
    expect(ExecutionTree.last!.mcp).toEqual(longLived);
  });

  test("bare .mcp() defaults the mode to settling", async () => {
    await om("mcp-default").mcp().run(noop);
    expect(ExecutionTree.last!.mcp).toEqual({ mode: "settling" });
  });

  test("an om that never calls .mcp() carries no exposure", async () => {
    await om("mcp-absent").describe({ summary: "not exposed" }).args(schema).run(noop);
    expect(ExecutionTree.last!.mcp).toBeUndefined();
  });

  test(".mcp() and .describe() do not displace each other", async () => {
    await om("mcp-and-describe").describe({ summary: "both" }).mcp().args(schema).run(noop);
    expect(ExecutionTree.last!.description).toEqual({ summary: "both" });
    expect(ExecutionTree.last!.mcp).toEqual({ mode: "settling" });
  });
});

describe("action .mcp()", () => {
  test("survives every builder link, in both directions", () => {
    expect(action("a").mcp(longLived).run(noop).mcp).toEqual(longLived);
    expect(action("b").mcp(longLived).emits<{ tick: number }>().run(noop).mcp).toEqual(longLived);
    expect(action("c").mcp(longLived).ref<string>().run(noop).mcp).toEqual(longLived);
    expect(action("d").mcp(longLived).args(schema).run(noop).mcp).toEqual(longLived);
    // The other direction: the links come first, `.mcp()` last.
    expect(action("e").emits<{ tick: number }>().ref<string>().mcp(longLived).run(noop).mcp) //
      .toEqual(longLived);
    expect(action("f").args(schema).mcp(longLived).run(noop).mcp).toEqual(longLived);
    expect(action("g").run(noop).mcp).toBeUndefined();
  });

  test("bare .mcp() defaults the mode to settling", () => {
    expect(action("h").mcp().run(noop).mcp).toEqual({ mode: "settling" });
  });

  test(".mcp() does not displace .describe()", () => {
    const built = action("i").describe({ summary: "both" }).mcp().args(schema).run(noop);
    expect(built.description).toEqual({ summary: "both" });
    expect(built.mcp).toEqual({ mode: "settling" });
  });
});
