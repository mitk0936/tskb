import { afterEach, describe, expect, test } from "vitest";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

/** The recorded args of the root's first child, as `result.json` and the logs carry them. */
const childArgs = (): readonly unknown[] =>
  ExecutionTree.last!.runViewForTest().root.children[0]!.args;

/**
 * Args are recorded on every node. Recording them verbatim once serialized a passed activity
 * to its whole tree (~85 MB per call), so live objects are tagged and oversized args noted.
 */
describe("recorded args", () => {
  test("plain data is kept as is", async () => {
    const take = action("take").run(async (_ctx, _a: unknown) => {});
    await om("args-plain").run(async () => {
      await take({ rows: 3, tags: ["a"], when: new Date(0) }).result;
    });
    expect(childArgs()).toEqual([{ rows: 3, tags: ["a"], when: "1970-01-01T00:00:00.000Z" }]);
  });

  test("an activity passed as an arg is a tag, not its tree", async () => {
    const inner = action("inner").run(async () => 1);
    const take = action("take").run(async (_ctx, _a: unknown) => {});
    await om("args-activity").run(async () => {
      const a = inner();
      await a.result;
      await take({ upstream: a }).result;
    });
    const [arg] = ExecutionTree.last!.runViewForTest().root.children[1]!.args;
    expect(arg).toEqual({ upstream: expect.stringMatching(/^\[Activity .+\]$/) });
  });

  test("a class instance is tagged with its class name", async () => {
    class Client {
      secret = "x";
    }
    const take = action("take").run(async (_ctx, _a: unknown) => {});
    await om("args-class").run(async () => {
      await take(new Client()).result;
    });
    expect(childArgs()).toEqual(["[Client]"]);
  });

  test("an oversized arg becomes a note", async () => {
    const take = action("take").run(async (_ctx, _a: unknown) => {});
    await om("args-large").run(async () => {
      await take("x".repeat(200 * 1024)).result;
    });
    expect(childArgs()).toEqual([expect.stringMatching(/KB of JSON — too large to record\]$/)]);
  });

  test("a cyclic arg becomes a note, not a failure", async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const take = action("take").run(async (_ctx, _a: unknown) => {});
    await om("args-cyclic").run(async () => {
      await take(cyclic).result;
    });
    expect(childArgs()).toEqual(["[Object — not JSON]"]);
    expect(process.exitCode).toBe(0);
  });
});
