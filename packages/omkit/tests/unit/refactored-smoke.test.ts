import { afterEach, describe, expect, test } from "vitest";
import { om, action, step, CancelledError } from "../../src/index.ts";
// Deep import: the engine is internal (not in the public barrel); tests reach it for reset/introspection.
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  // The singleton is nulled at finalize, but reset defensively and clear any exit
  // code a failing-action test set, so it doesn't pollute the vitest process.
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("refactored core", () => {
  test("om runs a child action and resolves its value", async () => {
    let got: number | undefined;
    await om("smoke", async () => {
      const add = action("add").run(async (_ctx, a: number, b: number) => a + b);
      got = await add(2, 3).result;
    });
    expect(got).toBe(5);
  });

  test("a failing action's .result rejects with its error", async () => {
    let err: unknown;
    await om("smoke", async () => {
      const boom = action("boom").run(async () => {
        throw new Error("nope");
      });
      err = await boom().result.catch((e) => e);
    });
    expect((err as Error).message).toBe("nope");
  });

  test("step produces a value under its own node", async () => {
    let v: number | undefined;
    await om("smoke", async () => {
      v = await step("compute", async () => 21 * 2);
    });
    expect(v).toBe(42);
  });

  test("exec outside a root om throws", () => {
    const x = action("x").run(async () => 1);
    expect(() => x()).toThrow(/only run inside a root om/);
  });

  test("parent log bubbles a child's launch ref and completion", async () => {
    await om("smoke", async () => {
      const kid = action("kid").run(async () => "v");
      await kid().result;
    });
    const entries = ExecutionTree.last!.store.entries();
    const bubbled = entries.filter((e) => e.nodeId === "main" && e.level === "child");
    expect(bubbled.some((e) => e.source === "launch" && /→ kid_/.test(e.message))).toBe(true);
    expect(bubbled.some((e) => /^kid_/.test(e.source) && e.message === "✓ done · ok")).toBe(true);
  });

  test("assert tallies and a failure sets the verdict", async () => {
    await om("smoke", async ({ assert }) => {
      assert(1 + 1 === 2, "math works");
      assert(1 + 1 === 3, "math broken");
    });
    const tree = ExecutionTree.last!;
    const asserts = tree.store.entries().filter((e) => e.level === "assert");
    expect(asserts).toHaveLength(2);
    expect(asserts.some((e) => e.message.includes("⊨ pass"))).toBe(true);
    expect(asserts.some((e) => e.message.includes("⊭ FAIL"))).toBe(true);
    // A failed assertion makes the run non-green.
    expect(process.exitCode).toBe(1);
  });

  test("snapshot writes a file and logs a snapshot line", async () => {
    let file: string | undefined;
    await om("smoke", async ({ snapshot }) => {
      file = await snapshot("config", { port: 3000 });
    });
    expect(file).toMatch(/snapshots[\\/].*config\.json$/);
    const { readFileSync } = await import("node:fs");
    expect(JSON.parse(readFileSync(file!, "utf8"))).toEqual({ port: 3000 });
    const snaps = ExecutionTree.last!.store.entries().filter((e) => e.level === "snapshot");
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.message).toContain("config → ");
  });

  test("a daemon keeps the run alive until cancel() tears it down", async () => {
    let ended = false;
    await om("smoke", async ({ cancel }) => {
      const daemon = action("daemon").run(async (ctx) => {
        await new Promise<void>((resolve) => {
          if (ctx.signal.aborted) return resolve();
          ctx.signal.addEventListener("abort", () => resolve(), { once: true });
        });
        ended = true;
      });
      daemon(); // not awaited — keeps the run alive
      await new Promise((r) => setTimeout(r, 10)); // let the daemon body start
      cancel();
    });
    // If keep-alive/teardown were broken this would hang; reaching here proves it drained.
    expect(ended).toBe(true);
  });

  test("cancelling a node's .result rejects with CancelledError and marks it cancelled", async () => {
    let caught: unknown;
    await om("smoke", async () => {
      const hang = action("hang").run(async (ctx) => {
        await new Promise<void>((_resolve, reject) => {
          if (ctx.signal.aborted) return reject(new Error("aborted"));
          ctx.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      });
      const h = hang();
      h.cancel();
      caught = await h.result.catch((e) => e);
    });
    expect(caught).toBeInstanceOf(CancelledError);
    const node = ExecutionTree.last!.root.children.find((c) => c.name === "hang");
    expect(node?.status).toBe("cancelled");
  });

  test("a declared event lands as an event entry on its node", async () => {
    await om("smoke", async () => {
      const emitter = action("emitter")
        .emits<{ ping: string }>()
        .run(async (ctx) => {
          ctx.emit("ping", "hi");
        });
      await emitter().result;
    });
    const events = ExecutionTree.last!.store.entries().filter(
      (e) => e.level === "event" && e.message.startsWith("ping")
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.path).toMatch(/^main\/emitter_/);
  });
});
