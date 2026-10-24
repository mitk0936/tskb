import { afterEach, describe, expect, test } from "vitest";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import { REF_CALL_CAP, traceHandle } from "../../src/core/refTrace.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

const links = (op: string): readonly LogEntry[] =>
  ExecutionTree.last!.store.entries().filter((e) => e.level === "link" && e.source === op);

const tick = () => new Promise((r) => setTimeout(r, 10));

// A daemon that emits `ready`, attaches a small handle, and stops when its signal aborts.
class Counter {
  #n = 0; // a private field: the traced handle must still reach it
  bump(by = 1): number {
    return (this.#n += by);
  }
  async later(): Promise<number> {
    await tick();
    return this.#n;
  }
  boom(): never {
    throw new Error("boom");
  }
  _internal(): number {
    return this.#n;
  }
}
const server = action("server")
  .emits<{ ready: void }>()
  .ref<Counter>()
  .run(async (ctx) => {
    ctx.attach(new Counter());
    await tick();
    ctx.emit("ready");
    await new Promise<void>((res) =>
      ctx.signal.aborted ? res() : ctx.signal.addEventListener("abort", () => res())
    );
  });

describe("cross-node links", () => {
  test("a once() from another node is recorded on the target when it fires", async () => {
    await om("links").run(async ({ cancel }) => {
      const s = server();
      await s.once("ready");
      cancel();
    });
    const [once] = links("once");
    expect(once?.path).toMatch(/server_/);
    expect(once?.link).toMatchObject({ op: "once", from: "main", key: "ready", outcome: "fired" });
    expect(once?.link?.site).toMatch(/links\.test\.ts:\d+$/);
    expect(once?.link?.ms).toBeGreaterThanOrEqual(0);
  });

  test("a once() that the target's end resolves is recorded as ended", async () => {
    await om("links").run(async () => {
      const quick = action("quick")
        .emits<{ ready: void }>()
        .run(async () => 1)();
      await quick.once("ready");
    });
    expect(links("once")[0]?.link).toMatchObject({ key: "ready", outcome: "ended" });
  });

  test("once('done') is recorded too", async () => {
    await om("links").run(async () => {
      await action("quick")
        .run(async () => 1)()
        .once("done");
    });
    expect(links("once")[0]?.link).toMatchObject({ key: "done", outcome: "fired", from: "main" });
  });

  test("a cancel() from another node records who cancelled it, and from where", async () => {
    await om("links").run(async ({ cancel }) => {
      const s = server();
      await tick();
      s.cancel();
      await tick();
      cancel();
    });
    const [c] = links("cancel");
    expect(c?.path).toMatch(/server_/);
    expect(c?.link).toMatchObject({ op: "cancel", from: "main" });
    expect(c?.link?.site).toMatch(/links\.test\.ts:\d+$/);
  });

  test("teardown cancels record no link — only a call from a node does", async () => {
    await om("links").run(async ({ cancel }) => {
      server();
      await tick();
      cancel();
    });
    expect(links("cancel")).toHaveLength(0);
  });

  test("method calls on an attached ref are recorded with caller, duration and outcome", async () => {
    let value = 0;
    await om("links").run(async ({ cancel }) => {
      const s = server();
      const counter = await s.ref;
      counter.bump(2);
      value = await counter.later();
      expect(() => counter.boom()).toThrow("boom");
      counter._internal(); // `_`-prefixed: not recorded
      await action("user").run(async () => {
        (await s.ref).bump();
      })().result;
      cancel();
    });
    expect(value).toBe(2);
    const calls = links("ref").map((e) => e.link!);
    expect(calls.map((c) => [c.key, c.outcome])).toEqual([
      ["bump", "ok"],
      ["later", "ok"],
      ["boom", "failed"],
      ["bump", "ok"],
    ]);
    expect(calls[0]?.from).toBe("main");
    expect(calls[3]?.from).toMatch(/^user_/);
    expect(calls[1]?.ms).toBeGreaterThanOrEqual(5);
  });

  test("every .ref read hands back the same traced handle", async () => {
    await om("links").run(async ({ cancel }) => {
      const s = server();
      expect(await s.ref).toBe(await s.ref);
      cancel();
    });
  });
});

describe("traceHandle", () => {
  test("passes primitives and nullish handles through", () => {
    const report = { call: () => {}, capped: () => {} };
    expect(traceHandle(42, report)).toBe(42);
    expect(traceHandle(undefined, report)).toBe(undefined);
    expect(traceHandle(null, report)).toBe(null);
  });

  test("records nothing outside a node, and stops at the cap", async () => {
    const calls: string[] = [];
    let capped = 0;
    const report = { call: (c: { key: string }) => calls.push(c.key), capped: () => capped++ };
    const traced = traceHandle(new Counter(), report);
    traced.bump(); // no ambient node
    expect(calls).toHaveLength(0);
    await om("links").run(async () => {
      for (let i = 0; i < REF_CALL_CAP + 5; i++) traced.bump();
    });
    expect(calls).toHaveLength(REF_CALL_CAP);
    expect(capped).toBe(1);
  });
});
