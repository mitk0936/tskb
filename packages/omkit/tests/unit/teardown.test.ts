import { afterEach, describe, expect, test } from "vitest";
import { om, action, CancelledError } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

const originalGraceMs = ExecutionTree.graceMs;

afterEach(() => {
  ExecutionTree.reset();
  ExecutionTree.graceMs = originalGraceMs;
  process.exitCode = 0;
});

/** Count the run-level "tearing down · …" narration lines in the last run's log. */
const teardownLines = (): string[] =>
  ExecutionTree.last!.store.entries()
    .filter((e) => e.level === "run" && e.message.startsWith("tearing down"))
    .map((e) => e.message);

describe("teardown mechanics", () => {
  test("cancel() is idempotent — a second cancel does not narrate teardown twice", async () => {
    await om("teardown").run(async ({ cancel }) => {
      cancel();
      cancel();
    });
    expect(teardownLines()).toHaveLength(1);
    expect(teardownLines()[0]).toContain("cancelled");
  });

  test("a daemon that ignores its abort signal is force-finalized after graceMs", async () => {
    ExecutionTree.graceMs = 40; // short real timer instead of the 5s default
    let reached = false;
    await om("teardown").run(async ({ cancel }) => {
      // Fire-and-forget daemon that never honors the signal (never settles).
      action("stubborn").run(() => new Promise<void>(() => {}))();
      await new Promise((r) => setTimeout(r, 5)); // let the daemon body start running
      cancel(); // teardown starts; the daemon won't settle, so the grace timer must finalize
    });
    reached = true; // if teardown could not force-finalize, om() would hang and we'd never get here
    expect(reached).toBe(true);
    const straggler = ExecutionTree.last!.root.children.find((c) => c.name === "stubborn");
    expect(straggler?.status).toBe("running"); // recorded as-is, not fabricated
  });

  test("SIGINT handler tears down once and is idempotent", async () => {
    const before = process.listeners("SIGINT");
    await om("teardown").run(async () => {
      const added = process.listeners("SIGINT").filter((l) => !before.includes(l));
      expect(added).toHaveLength(1); // omkit installed exactly one handler
      (added[0] as () => void)(); // simulate Ctrl+C
      (added[0] as () => void)(); // mash it again → must be a no-op
    });
    expect(teardownLines()).toHaveLength(1);
    expect(teardownLines()[0]).toContain("interrupted (SIGINT)");
    // The handler is removed once the run finalizes — no listener leaks past the run.
    const after = process.listeners("SIGINT").filter((l) => !before.includes(l));
    expect(after).toHaveLength(0);
  });
});

describe("failure model", () => {
  test("a fire-and-forget failure tears down a sibling daemon and is a fault (exit 1)", async () => {
    let daemonTornDown = false;
    await om("teardown").run(async () => {
      action("daemon").run(
        (ctx) =>
          new Promise<void>((resolve) => {
            ctx.signal.addEventListener("abort", () => {
              daemonTornDown = true;
              resolve();
            });
          })
      )(); // fire-and-forget daemon
      action("boom").run(async () => {
        throw new Error("kaboom");
      })(); // fire-and-forget failure → unobserved → teardown
    });
    expect(daemonTornDown).toBe(true);
    expect(process.exitCode).toBe(1);
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("kaboom"))).toBe(true);
  });

  test("a successful activity's .result resolves the value", async () => {
    let outcome: unknown;
    await om("teardown").run(async () => {
      outcome = await action("compute").run(async () => 42)().result;
    });
    expect(outcome).toBe(42);
    expect(process.exitCode).toBe(0);
  });

  test("an awaited failure, caught, is observed → green, sibling untouched", async () => {
    let daemonTornDown = false;
    let caught: unknown;
    await om("teardown").run(async ({ cancel }) => {
      action("daemon").run(
        (ctx) =>
          new Promise<void>((resolve) => {
            ctx.signal.addEventListener("abort", () => {
              daemonTornDown = true;
              resolve();
            });
          })
      )();
      caught = await action("boom")
        .run(async () => {
          throw new Error("handled");
        })()
        .result.catch((e) => e); // catching .result observes → green
      cancel(); // we end the run ourselves
    });
    expect((caught as Error).message).toBe("handled");
    expect(daemonTornDown).toBe(true); // torn down by OUR cancel(), not the failure
    expect(process.exitCode).toBe(0);
  });

  test(".result rejects on failure; catching it observes and keeps the run green", async () => {
    let rejected = false;
    await om("teardown").run(async ({ cancel }) => {
      await action("boom")
        .run(async () => {
          throw new Error("nope");
        })()
        .result.catch(() => {
          rejected = true;
        });
      cancel();
    });
    expect(rejected).toBe(true); // .result rejected; .catch handled it
    expect(process.exitCode).toBe(0);
  });

  test(".result.catch owns a fire-and-forget failure — green, sibling untouched", async () => {
    let seen: unknown;
    let daemonTornDown = false;
    await om("teardown").run(async ({ cancel }) => {
      action("daemon").run(
        (ctx) =>
          new Promise<void>((res) =>
            ctx.signal.addEventListener("abort", () => {
              daemonTornDown = true;
              res();
            })
          )
      )();
      // Accessing .result observes the activity; .catch handles the crash — no teardown.
      action("boom")
        .run(async () => {
          throw new Error("owned");
        })()
        .result.catch((e) => {
          seen = e;
        });
      await new Promise((r) => setTimeout(r, 20)); // boom fails here; the catch owns it
      cancel();
    });
    expect((seen as Error).message).toBe("owned");
    expect(daemonTornDown).toBe(true); // by our cancel(), not the failure
    expect(process.exitCode).toBe(0);
  });

  test(".result.catch on a synchronously-throwing body owns the failure (green)", async () => {
    let seen: unknown;
    await om("teardown").run(async () => {
      // .result is read (observes) in the same tick as the launch, before the deferred body
      // runs; when the body throws on its commit microtask, the catch owns it (no teardown).
      action("sync-boom")
        .run(() => {
          throw new Error("sync");
        })()
        .result.catch((e) => {
          seen = e;
        });
      await new Promise((r) => setTimeout(r, 10)); // let the body run and fail
    });
    expect((seen as Error).message).toBe("sync");
    expect(process.exitCode).toBe(0);
  });

  test("a synchronously-throwing body delivers to a fluent on('error') (green)", async () => {
    let seen: unknown;
    await om("teardown").run(async () => {
      const h = action("sync-boom").run(() => {
        throw new Error("sync-on");
      })();
      h.on("error", (e) => {
        seen = e; // on('error') observes the failure, so the run stays green
      });
      await new Promise((r) => setTimeout(r, 10)); // let the body run and fail
    });
    expect((seen as Error).message).toBe("sync-on");
    expect(process.exitCode).toBe(0);
  });

  test("an uncaught .result rejection propagates and faults the run (exit 1)", async () => {
    await om("teardown").run(async () => {
      // .result rejects → the await throws in the body → root fault.
      await action("boom").run(async () => {
        throw new Error("rethrown");
      })().result;
    });
    expect(process.exitCode).toBe(1);
  });

  test("a saved handle read only after it fails still tears down (exit 1)", async () => {
    await om("teardown").run(async () => {
      const h = action("boom").run(async () => {
        throw new Error("late");
      })(); // .result not yet read → unobserved at fail-time
      await new Promise((r) => setTimeout(r, 20)); // boom fails here → teardown
      await h.result.catch(() => {}); // too late; the fault was already recorded at fail-time
    });
    expect(process.exitCode).toBe(1);
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("late"))).toBe(true);
  });

  test("ctx.cancel() with no other fault is green (exit 0)", async () => {
    await om("teardown").run(async ({ cancel }) => {
      action("daemon").run(
        (ctx) => new Promise<void>((res) => ctx.signal.addEventListener("abort", () => res()))
      )();
      cancel();
    });
    expect(process.exitCode).toBe(0);
  });

  test("a cancelled activity's .result rejects with CancelledError (cancel is not a fault)", async () => {
    let caught: unknown;
    await om("teardown").run(async ({ cancel }) => {
      const h = action("daemon").run(
        (ctx) =>
          new Promise<void>((_res, rej) =>
            ctx.signal.addEventListener("abort", () => rej(new Error("aborted")))
          )
      )();
      const read = h.result.catch((e) => {
        caught = e;
      });
      cancel();
      await read;
    });
    expect(caught).toBeInstanceOf(CancelledError);
    expect(process.exitCode).toBe(0);
  });

  test("a failed assert remains a fault (exit 1) — regression guard", async () => {
    await om("teardown").run(async ({ assert }) => {
      assert(false, "nope");
    });
    expect(process.exitCode).toBe(1);
  });

  test("a node awaited only via once('healthy') tears down when it fails", async () => {
    await om("teardown").run(async () => {
      const probe = action("probe")
        .emits<{ healthy: void }>()
        .run(async () => {
          throw new Error("never healthy");
        })();
      await probe.once("healthy"); // resolves undefined on settle; does NOT observe the error
    });
    expect(process.exitCode).toBe(1);
  });

  test("on('error') observes the failure — no teardown, green", async () => {
    let seen: unknown;
    await om("teardown").run(async ({ cancel }) => {
      const h = action("boom").run(async () => {
        throw new Error("handled via on-error");
      })();
      h.on("error", (e) => {
        seen = e;
      });
      await new Promise((r) => setTimeout(r, 20)); // boom fails here; on('error') observed it
      cancel(); // we end the run ourselves
    });
    expect((seen as Error).message).toBe("handled via on-error");
    expect(process.exitCode).toBe(0);
  });

  test("a failed action cancels its own children even when the failure is observed", async () => {
    let childCancelled = false;
    await om("teardown").run(async () => {
      const parent = action("parent").run(async (ctx) => {
        action("child").run(
          (c) =>
            new Promise<void>((resolve) => {
              c.signal.addEventListener("abort", () => {
                childCancelled = true;
                resolve();
              });
            })
        )();
        await new Promise((r) => setTimeout(r, 10)); // let the child start
        throw new Error("parent boom");
      });
      const r = await parent().result.catch((e) => e); // caught → observed → run keeps going
      expect((r as Error).message).toBe("parent boom");
    });
    expect(childCancelled).toBe(true); // subtree aborted by parent's failure…
    expect(process.exitCode).toBe(0); // …but the observed failure is not a fault
  });

  test("a daemon that fails AFTER attaching tears down (stale .ref is not observed)", async () => {
    await om("teardown").run(async () => {
      const daemon = action("daemon")
        .ref<number>()
        .run(async (ctx) => {
          ctx.attach(42); // handle resolves…
          await new Promise((r) => setTimeout(r, 10));
          throw new Error("post-attach boom"); // …then it fails
        })();
      const h = daemon;
      await h.ref; // downstream reads the handle (refObserved), then moves on
      await new Promise((r) => setTimeout(r, 40)); // daemon fails here → must tear down
    });
    expect(process.exitCode).toBe(1);
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("post-attach boom"))).toBe(true);
  });
});
