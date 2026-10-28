import { afterEach, describe, expect, test } from "vitest";
import { action, CancelledError, om } from "../../src/index.ts";
import { pollUntil } from "../../src/actions/poll-until.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

const nodeNamed = (name: string) => ExecutionTree.last!.root.children.find((c) => c.name === name);

describe("pollUntil", () => {
  test("resolves with the predicate's first non-empty value, after retrying", async () => {
    let calls = 0;
    let value: { port: number } | undefined;
    await om("poll-value").run(async () => {
      value = await pollUntil("port file", () => (++calls < 3 ? undefined : { port: 4000 }), {
        intervalMs: 5,
      }).result;
    });
    expect(value).toEqual({ port: 4000 });
    expect(calls).toBe(3);
  });

  test("treats false and null as 'not yet' but 0 and '' as values", async () => {
    const results: unknown[] = [];
    await om("poll-falsy").run(async () => {
      const seq = [false, null, 0];
      results.push(await pollUntil("zero", () => seq.shift(), { intervalMs: 1 }).result);
      results.push(await pollUntil("empty", () => "", { intervalMs: 1 }).result);
      results.push(await pollUntil("bool", async () => true, { intervalMs: 1 }).result);
    });
    expect(results).toEqual([0, "", true]);
  });

  test("names the node after its description", async () => {
    await om("poll-name").run(async () => {
      await pollUntil("api ready", () => true).result;
    });
    expect(nodeNamed("api ready")?.status).toBe("ok");
  });

  test("rejects with the description once timeoutMs passes", async () => {
    let error: unknown;
    let calls = 0;
    await om("poll-timeout").run(async () => {
      await pollUntil("never", () => void calls++, { intervalMs: 10, timeoutMs: 60 }).result.catch(
        (err: unknown) => (error = err)
      );
    });
    expect(String(error)).toMatch(/never: not met within 60ms \(\d+ checks\)/);
    expect(calls).toBeGreaterThan(1);
  });

  test("a throwing predicate fails the gate instead of being retried", async () => {
    let error: unknown;
    let calls = 0;
    await om("poll-throws").run(async () => {
      await pollUntil("boom", () => {
        calls++;
        throw new Error("probe broke");
      }).result.catch((err: unknown) => (error = err));
    });
    expect(String(error)).toContain("probe broke");
    expect(calls).toBe(1);
  });

  test("cancel stops polling and aborts the signal handed to the predicate", async () => {
    let error: unknown;
    let seen: AbortSignal | undefined;
    let calls = 0;
    await om("poll-cancel").run(async () => {
      const gate = pollUntil(
        "forever",
        (signal) => {
          seen = signal;
          calls++;
          return false;
        },
        { intervalMs: 10, timeoutMs: Infinity }
      );
      await new Promise((r) => setTimeout(r, 40));
      gate.cancel();
      await gate.result.catch((err: unknown) => (error = err));
    });
    const after = calls;
    await new Promise((r) => setTimeout(r, 50));
    expect(error).toBeInstanceOf(CancelledError);
    expect(seen?.aborted).toBe(true);
    expect(calls).toBe(after); // no checks after cancellation
  });
});

describe("ctx.untilAborted", () => {
  test("resolves on teardown, and cleanup after it is attributed to the waiting node", async () => {
    let cleanedUp = false;
    let daemonId = "";
    await om("until-aborted").run(async ({ cancel }) => {
      const daemon = action("server").run(async (ctx) => {
        await ctx.untilAborted();
        cleanedUp = true;
        console.log("closing server");
      })();
      daemonId = daemon.id;
      await new Promise((r) => setTimeout(r, 10));
      cancel();
    });
    expect(cleanedUp).toBe(true);
    const line = ExecutionTree.last!.store.entries().find((e) => e.message === "closing server");
    expect(line?.nodeId).toBe(daemonId);
  });

  test("resolves immediately when the signal has already aborted", async () => {
    let resolved = false;
    await om("until-aborted-late").run(async (ctx) => {
      ctx.cancel();
      await ctx.untilAborted();
      resolved = true;
    });
    expect(resolved).toBe(true);
  });
});
