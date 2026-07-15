import { afterEach, describe, expect, test } from "vitest";
import { action, om } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

const entries = (): readonly LogEntry[] => ExecutionTree.last!.store.entries();
const cancelEvents = (): readonly LogEntry[] =>
  entries().filter((e) => e.level === "event" && e.source === "cancel");

// A daemon that shuts down cleanly (resolves) when its signal aborts.
const daemon = () =>
  action("daemon").run(
    (ctx) => new Promise<void>((res) => ctx.signal.addEventListener("abort", () => res()))
  )();

describe("cancellation logging", () => {
  test("a running daemon cancelled by run teardown logs a cancellation event", async () => {
    await om("cancel-log", async ({ cancel }) => {
      daemon();
      await new Promise((r) => setTimeout(r, 10)); // let it start
      cancel();
    });
    expect(cancelEvents().some((e) => /daemon_/.test(e.path) && e.message === "cancelled")).toBe(
      true
    );
  });

  test("a directly-cancelled activity logs cancellation and bubbles ⊘ into the parent", async () => {
    await om("cancel-log", async ({ cancel }) => {
      const h = daemon();
      await new Promise((r) => setTimeout(r, 10));
      h.cancel(); // targeted — the run keeps going
      await new Promise((r) => setTimeout(r, 10));
      cancel();
    });
    // the activity's own cancellation event
    expect(cancelEvents().some((e) => /daemon_/.test(e.path))).toBe(true);
    // bubbled into main as a child line
    expect(entries().some((e) => e.level === "child" && e.message === "⊘ cancelled")).toBe(true);
  });

  test("root teardown logs no per-node cancellation on the root itself", async () => {
    await om("cancel-log", async ({ cancel }) => {
      cancel();
    });
    expect(cancelEvents().filter((e) => e.path === "main")).toHaveLength(0);
  });

  test("an already-finished action is not marked cancelled by a later teardown", async () => {
    await om("cancel-log", async ({ cancel }) => {
      await action("quick").run(async () => 1)().result; // settles ok before teardown
      cancel();
    });
    expect(cancelEvents().some((e) => /quick_/.test(e.path))).toBe(false);
  });
});
