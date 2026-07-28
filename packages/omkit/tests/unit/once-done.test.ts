import { afterEach, describe, expect, test } from "vitest";
import { action, om, isCancelled } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe('once("done")', () => {
  test("resolves the result value on success", async () => {
    let got: unknown;
    await om("once-done", async () => {
      got = await action("win")
        .run(async () => 42)()
        .once("done");
    });
    expect(got).toBe(42);
  });

  test("rejects with the failure and observes it — the body cannot sail past a failed gate", async () => {
    let caught: unknown;
    let sailedPast = false;
    await om("once-done", async () => {
      try {
        await action("boom")
          .run(async () => {
            throw new Error("build failed");
          })()
          .once("done");
        sailedPast = true;
      } catch (e) {
        caught = e;
      }
    });
    expect(sailedPast).toBe(false);
    expect((caught as Error).message).toBe("build failed");
    // The awaiter observed and handled the failure → no unobserved-failure teardown fault.
    expect(ExecutionTree.last!.runViewForTest().ok).toBe(true);
  });

  test("rejects CancelledError when the activity is cancelled", async () => {
    let caught: unknown;
    await om("once-done", async () => {
      const daemon = action("daemon").run(
        ({ signal }) =>
          new Promise<void>((_, reject) => {
            signal.addEventListener("abort", () => reject(new Error("stopped")), { once: true });
          })
      )();
      daemon.cancel();
      try {
        await daemon.once("done");
      } catch (e) {
        caught = e;
      }
    });
    expect(isCancelled(caught)).toBe(true);
  });
});
