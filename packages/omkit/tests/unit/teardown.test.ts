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
    await om(async ({ cancel }) => {
      cancel();
      cancel();
    });
    expect(teardownLines()).toHaveLength(1);
    expect(teardownLines()[0]).toContain("cancelled");
  });

  test("a daemon that ignores its abort signal is force-finalized after graceMs", async () => {
    ExecutionTree.graceMs = 40; // short real timer instead of the 5s default
    let reached = false;
    await om(async ({ cancel }) => {
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
    await om(async () => {
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
    await om(async () => {
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

  test("a successful activity's .result resolves { ok: true, value }", async () => {
    let outcome: unknown;
    await om(async () => {
      outcome = await action("compute").run(async () => 42)().result;
    });
    expect(outcome).toEqual({ ok: true, value: 42 });
    expect(process.exitCode).toBe(0);
  });

  test("an awaited failure resolves { ok: false } — observed, green, sibling untouched", async () => {
    let daemonTornDown = false;
    let outcome: unknown;
    await om(async ({ cancel }) => {
      action("daemon").run(
        (ctx) =>
          new Promise<void>((resolve) => {
            ctx.signal.addEventListener("abort", () => {
              daemonTornDown = true;
              resolve();
            });
          })
      )();
      outcome = await action("boom").run(async () => {
        throw new Error("handled");
      })().result; // reading .result observes → green
      cancel(); // we end the run ourselves
    });
    expect(outcome).toMatchObject({ ok: false });
    expect((outcome as { error: Error }).error.message).toBe("handled");
    expect(daemonTornDown).toBe(true); // torn down by OUR cancel(), not the failure
    expect(process.exitCode).toBe(0);
  });

  test(".result never rejects — resolves { ok: false } even with nothing else attached", async () => {
    let rejected = false;
    let resolvedOk: boolean | undefined;
    await om(async ({ cancel }) => {
      const outcome = await action("boom")
        .run(async () => {
          throw new Error("nope");
        })()
        .result.then(
          (o) => o,
          () => {
            rejected = true;
            return { ok: true as const, value: undefined };
          }
        );
      resolvedOk = outcome.ok;
      cancel();
    });
    expect(rejected).toBe(false); // .result resolved, did not reject
    expect(resolvedOk).toBe(false);
  });

  test("handleFailure runs on a fire-and-forget failure — green, sibling untouched", async () => {
    let seen: unknown;
    let daemonTornDown = false;
    await om(async ({ cancel }) => {
      action("daemon").run(
        (ctx) =>
          new Promise<void>((res) =>
            ctx.signal.addEventListener("abort", () => {
              daemonTornDown = true;
              res();
            })
          )
      )();
      action("boom")
        .run(async () => {
          throw new Error("owned");
        })()
        .handleFailure((e) => {
          seen = e;
        });
      await new Promise((r) => setTimeout(r, 20)); // boom fails here; handler owns it
      cancel();
    });
    expect((seen as Error).message).toBe("owned");
    expect(daemonTornDown).toBe(true); // by our cancel(), not the failure
    expect(process.exitCode).toBe(0);
  });

  test("a synchronously-throwing body delivers to its fluent handleFailure (green)", async () => {
    let seen: unknown;
    await om(async () => {
      action("sync-boom")
        .run(() => {
          throw new Error("sync");
        })()
        // The handler is attached (fluent) before the deferred body runs; when the body
        // throws on its commit microtask, handleFailure owns the failure (no teardown).
        .handleFailure((e) => {
          seen = e;
        });
      await new Promise((r) => setTimeout(r, 10)); // let the body run and fail
    });
    expect((seen as Error).message).toBe("sync");
    expect(process.exitCode).toBe(0);
  });

  test("a synchronously-throwing body delivers to a fluent on('error') (green)", async () => {
    let seen: unknown;
    await om(async () => {
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

  test("re-throwing an outcome error faults the run (exit 1)", async () => {
    await om(async () => {
      const r = await action("boom").run(async () => {
        throw new Error("rethrown");
      })().result;
      if (!r.ok) throw r.error; // body throws → root fault
    });
    expect(process.exitCode).toBe(1);
  });

  test("a saved handle read only after it fails still tears down (exit 1)", async () => {
    await om(async () => {
      const h = action("boom").run(async () => {
        throw new Error("late");
      })(); // .result not yet read → unobserved at fail-time
      await new Promise((r) => setTimeout(r, 20)); // boom fails here → teardown
      await h.result; // too late; resolves { ok: false } but the fault is recorded
    });
    expect(process.exitCode).toBe(1);
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("late"))).toBe(true);
  });

  test("ctx.cancel() with no other fault is green (exit 0)", async () => {
    await om(async ({ cancel }) => {
      action("daemon").run(
        (ctx) => new Promise<void>((res) => ctx.signal.addEventListener("abort", () => res()))
      )();
      cancel();
    });
    expect(process.exitCode).toBe(0);
  });

  test("a cancelled activity's .result is CancelledError and handleFailure did not run", async () => {
    let handlerRan = false;
    let outcome: unknown;
    await om(async ({ cancel }) => {
      const h = action("daemon")
        .run(
          (ctx) =>
            new Promise<void>((_res, rej) =>
              ctx.signal.addEventListener("abort", () => rej(new Error("aborted")))
            )
        )()
        .handleFailure(() => {
          handlerRan = true;
        });
      const read = h.result.then((o) => {
        outcome = o;
      });
      cancel();
      await read;
    });
    expect(handlerRan).toBe(false);
    expect(outcome).toMatchObject({ ok: false });
    expect((outcome as { error: unknown }).error).toBeInstanceOf(CancelledError);
    expect(process.exitCode).toBe(0);
  });

  test("a failed assert remains a fault (exit 1) — regression guard", async () => {
    await om(async ({ assert }) => {
      assert(false, "nope");
    });
    expect(process.exitCode).toBe(1);
  });

  test("a node awaited only via once('healthy') tears down when it fails", async () => {
    await om(async () => {
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
    await om(async ({ cancel }) => {
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
    await om(async () => {
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
      const r = await parent().result; // observed → run keeps going
      expect(r.ok).toBe(false);
    });
    expect(childCancelled).toBe(true); // subtree aborted by parent's failure…
    expect(process.exitCode).toBe(0); // …but the observed failure is not a fault
  });

  test("a daemon that fails AFTER attaching tears down (stale .ref is not observed)", async () => {
    await om(async () => {
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
