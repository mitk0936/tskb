# Cancellation & Teardown Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace omkit's over-built teardown machinery with one idempotent `teardown(reason)` where unhandled action failures, Ctrl+C, and `ctx.cancel()` all tear the run down gracefully and always write the log.

**Architecture:** Two files change — `packages/omkit/src/core/ExecutionTree.ts` (the run singleton) and `packages/omkit/src/core/ActionRun.ts` (a node). A node tracks whether its failure is _observed_ (someone holds its `.done`/`.ref` or an `on("error")` handler); an unobserved failure calls back into the tree to teardown and record a fault. The verdict is now purely the recorded-fault list, so a caught failure is green. Teardown aborts the root once, waits up to a single grace timer, then finalizes exactly once.

**Tech Stack:** TypeScript (ESM, `.ts` extensions in imports), Vitest (run from repo root), Node ≥ 20.11.

## Global Constraints

- Run tests from the **repo root** with `npx vitest run <path>` — the Vitest config lives at `vitest.config.ts` and includes `packages/*/tests/**/*.test.ts`.
- Tests deep-import the engine (`../../src/core/ExecutionTree.ts`) and MUST `ExecutionTree.reset()` + `process.exitCode = 0` in `afterEach` (see existing `refactored-smoke.test.ts`).
- Imports use explicit `.ts` extensions (repo convention).
- **Do NOT `git commit`.** Project rule (user standing instruction): no commits unless the user explicitly asks. Each task's final step **stages** changes and stops for the user; the executor must ask before committing.
- No changes to the action API surface, log formats, writers, or on-disk artifact shapes.

---

## File Structure

- `packages/omkit/src/core/ActionRun.ts` — add the `observed` flag, mark it from the `.done`/`.ref` getters and `on/once("error")`, self-catch the node's own rejections, abort the node's own subtree on failure (with a `cascadeCancelled` flag to distinguish ancestor-initiated aborts), and fire an `onUnhandledFailure` callback for an unobserved real failure. Stop recording verdict state here.
- `packages/omkit/src/core/ExecutionTree.ts` — rename `beginTeardown` → `teardown`; delete `force`/`forced`/`forcedWake`/`sigints`/`handleSigint` escalation and the `process.exit()`; add the single grace timer via a `teardownGrace` deferred and a static `graceMs`; make the verdict the fault list only; wire `onUnhandledFailure`; move process-handler removal to _after_ the log writes.
- `packages/omkit/tests/unit/teardown.test.ts` — **new** test file for the behaviors below (kept separate from `refactored-smoke.test.ts`).

---

## Task 1: Simplify teardown mechanics (behavior-preserving)

Rename and collapse the teardown machinery to one path + one grace timer, with no `process.exit`, and fix the handler-removal ordering so the log can't be truncated. No failure-model change yet — the existing suite must stay green.

**Files:**

- Modify: `packages/omkit/src/core/ExecutionTree.ts`
- Test: `packages/omkit/tests/unit/teardown.test.ts` (create)

**Interfaces:**

- Consumes: `defer`/`Deferred` from `../foundation/Deferred.ts` (already imported); `ExecutionTree.reset()`, `ExecutionTree.last` (existing static test seams).
- Produces:
  - `ExecutionTree.teardown(reason: string): void` — public, idempotent (replaces private `beginTeardown`).
  - `static ExecutionTree.graceMs: number` — default `5000`; overridable in tests.
  - `cancel()` still exists and now delegates to `teardown("cancelled")`.

- [ ] **Step 1: Write the failing tests**

Create `packages/omkit/tests/unit/teardown.test.ts`:

```ts
import { afterEach, describe, expect, test } from "vitest";
import { om, action } from "../../src/index.ts";
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
      action("stubborn")
        .run(() => new Promise<void>(() => {}))()
        .exec();
      cancel(); // teardown starts; the daemon won't settle, so the grace timer must finalize
    });
    reached = true; // if teardown could not force-finalize, om() would hang and we'd never get here
    expect(reached).toBe(true);
    const straggler = ExecutionTree.last!.root.children.find((c) => c.name === "stubborn");
    expect(straggler?.status).toBe("running"); // recorded as-is, not fabricated
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/omkit/tests/unit/teardown.test.ts`
Expected: FAIL — `ExecutionTree.graceMs` is `undefined` and/or `teardown` is not the public method; the daemon test hangs until it errors or times out.

- [ ] **Step 3: Rewrite the teardown/finalize/drive section of `ExecutionTree.ts`**

In `packages/omkit/src/core/ExecutionTree.ts`:

3a. **Delete** these members entirely: the `sigints`, `forced`, `forcedWake`, `graceTimer` teardown-escape comment block and fields as they stand; the `force()` method; the `handleSigint()` method; the `onSigint = () => this.handleSigint()` arrow; and the `TEARDOWN_GRACE_MS` const at the bottom.

3b. **Add** these fields (near the other private fields) and the static:

```ts
  static graceMs = 5000; // teardown waits this long for nodes to settle, then finalizes anyway
```

```ts
  private phase: "open" | "closing" | "closed" = "open";
  private finalized = false;
  private graceTimer: NodeJS.Timeout | undefined;
  private readonly teardownGrace: Deferred<void> = defer<void>();
  private readonly onSigint = (): void => this.teardown("interrupted (SIGINT)");
```

(Keep the existing `onUncaught`/`onUnhandled` arrows and the `originalLog` field.)

3c. **Replace** `cancel()` + `beginTeardown()` + `force()` with the single public `teardown`:

```ts
  /** Tear the whole run down (aborts the root, cascading to every node). Idempotent. */
  cancel(): void {
    this.teardown("cancelled");
  }

  /**
   * The sole teardown path: `open → closing`, narrate the reason once, abort the root
   * (cascading to every node — procs killed, waits unblocked, daemons stopped). Later
   * calls are no-ops. A single grace timer guarantees finalize even if a node's cleanup
   * wedges after its proc is already dead, so the run always writes its log.
   */
  teardown(reason: string): void {
    if (this.phase !== "open") return;
    this.phase = "closing";
    this.narrate(`tearing down · ${reason}`);
    this.root.cancel();
    // Not unref'd: it must hold the process alive long enough to finalize.
    this.graceTimer = setTimeout(() => {
      this.teardownGrace.resolve(); // break drive()'s wait on a node that won't settle
      void this.finalize(); // …and finalize even if drive() was never reached (hung body)
    }, ExecutionTree.graceMs);
  }
```

3d. **Replace** `drive()`:

```ts
  private async drive(): Promise<void> {
    // Drain every launched node. Teardown aborts them (procs reaped, waits unblocked),
    // so they settle and this returns. The grace timer resolves `teardownGrace` if a
    // node's own cleanup wedges — the OS process is already dead by then.
    while (this.unsettled.size > 0) {
      const graced = await Promise.race([
        Promise.allSettled([...this.unsettled]).then(() => false),
        this.teardownGrace.promise.then(() => true),
      ]);
      if (graced) break;
    }
  }
```

3e. In `runRoot()`, **delete** the line `if (this.root.status === "failed") this.beginTeardown("body error");` (root-body faults are handled by the failure model in Task 2). Leave the rest of `runRoot` intact.

3f. **Replace** `finalize()` with this ordering (guarded once; handlers removed _after_ the writes; no `process.exit`):

```ts
  private async finalize(): Promise<void> {
    if (this.finalized) return;
    this.finalized = true;
    if (this.phase === "open") this.teardown("completed");
    this.phase = "closed";
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.narrate("finished");
    this.store.close();
    await this.streaming;
    await this.liveRendering;

    const flat = this.registry.map((node) => this.nodeView(node));
    const entries = this.store.entries();
    const at = (name: string): string => path.join(this.folder.path(), name);
    const assertSummary = `⊨ ${this.assertionsPassed} passed · ⊭ ${this.assertionsFailed} failed`;
    await writeNodeLogs(flat, entries);
    await writeRollup(at("events.log"), flat, entries, (e) => e.level === "event");
    await writeRollup(at("asserts.log"), flat, entries, (e) => e.level === "assert", assertSummary);
    await writeRollup(at("snapshots.log"), flat, entries, (e) => e.level === "snapshot");
    await writeResult(at("result.json"), this.runView());

    // Only now let go of the process hooks — a Ctrl+C during the writes must still be
    // caught (as a no-op) so it can't fall through to Node's kill-without-log default.
    process.off("SIGINT", this.onSigint);
    process.off("uncaughtException", this.onUncaught);
    process.off("unhandledRejection", this.onUnhandled);
    this.consoleCapture.uninstall();
    ExecutionTree.current = null;
    this.printSummary(at, assertSummary);
    if (!this.verdictOk()) process.exitCode = 1;
  }
```

3g. In `onFatal`, rename the `this.beginTeardown(kind)` call to `this.teardown(kind)`. Leave its `extraFailures` push as-is for now (Task 2 renames it).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/omkit/tests/unit/teardown.test.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Run the existing suite to confirm no regressions**

Run: `npx vitest run packages/omkit/tests/unit/refactored-smoke.test.ts`
Expected: PASS (all 11 tests) — teardown mechanics are behavior-preserving here.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck --workspace omkit`
Expected: no errors (dangling references to deleted `beginTeardown`/`force`/`TEARDOWN_GRACE_MS` would surface here).

- [ ] **Step 7: Stage and pause for the user**

```bash
git add packages/omkit/src/core/ExecutionTree.ts packages/omkit/tests/unit/teardown.test.ts
```

Then STOP and ask the user before committing (project rule: no commits without explicit request).

---

## Task 2: Observed-failure model + verdict-by-fault

Make an unhandled action failure tear the run down, a caught one stay green, and the verdict reflect only recorded faults.

**Files:**

- Modify: `packages/omkit/src/core/ActionRun.ts`
- Modify: `packages/omkit/src/core/ExecutionTree.ts`
- Test: `packages/omkit/tests/unit/teardown.test.ts` (extend)

**Interfaces:**

- Consumes: `ExecutionTree.teardown(reason)` and `ExecutionTree.graceMs` from Task 1.
- Produces:
  - `NodeInit.onUnhandledFailure: (path: string, error: unknown) => void` — the tree wires this to `recordFault` + `teardown`.
  - `ActionRun` marks itself _observed_ when `.done` or `.ref` is read, or when `on("error")`/`once("error")` is attached.
  - On a real (not-aborted) failure, `ActionRun` aborts its own subtree (`controller.abort()`); `cascadeCancelled` flags an ancestor-initiated abort so the two are distinguished.
  - `ExecutionTree` private `faults: Array<{ action: string; error: string }>` (renamed from `extraFailures`); `verdictOk()` returns `this.faults.length === 0`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/omkit/tests/unit/teardown.test.ts` (inside a new `describe`):

```ts
describe("failure model", () => {
  test("a fire-and-forget failure tears down a sibling daemon and is a fault (exit 1)", async () => {
    let daemonTornDown = false;
    await om(async () => {
      action("daemon")
        .run(
          (ctx) =>
            new Promise<void>((resolve) => {
              ctx.signal.addEventListener("abort", () => {
                daemonTornDown = true;
                resolve();
              });
            })
        )()
        .exec(); // fire-and-forget daemon
      action("boom")
        .run(async () => {
          throw new Error("kaboom");
        })()
        .exec(); // fire-and-forget failure → unobserved → teardown
    });
    expect(daemonTornDown).toBe(true);
    expect(process.exitCode).toBe(1);
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("kaboom"))).toBe(true);
  });

  test("a caught failure is fully handled — green, exit 0, sibling daemon untouched", async () => {
    let daemonTornDown = false;
    let caught: unknown;
    await om(async ({ cancel }) => {
      action("daemon")
        .run(
          (ctx) =>
            new Promise<void>((resolve) => {
              ctx.signal.addEventListener("abort", () => {
                daemonTornDown = true;
                resolve();
              });
            })
        )()
        .exec();
      try {
        await action("boom")
          .run(async () => {
            throw new Error("handled");
          })()
          .exec().done;
      } catch (e) {
        caught = e;
      }
      cancel(); // we end the run ourselves; the failure must NOT have torn it down
    });
    expect((caught as Error).message).toBe("handled");
    expect(daemonTornDown).toBe(true); // torn down by OUR cancel(), not the failure
    expect(process.exitCode).toBe(0); // caught ⇒ no fault ⇒ green
  });

  test("an uncaught await tears down and is a fault (exit 1)", async () => {
    await om(async () => {
      await action("boom")
        .run(async () => {
          throw new Error("uncaught");
        })()
        .exec().done; // no try/catch → propagates → root fault
    });
    expect(process.exitCode).toBe(1);
  });

  test("a saved handle awaited later still tears down when it fails first", async () => {
    let reached = false;
    await om(async () => {
      const h = action("boom")
        .run(async () => {
          throw new Error("late");
        })()
        .exec(); // .done not yet read → unobserved at fail-time
      await new Promise((r) => setTimeout(r, 20)); // boom fails here → teardown
      reached = true;
      try {
        await h.done;
      } catch {
        /* too late */
      }
    });
    expect(process.exitCode).toBe(1);
    // The saved-then-late-awaited handle does not protect it: it was a fault.
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("late"))).toBe(true);
    void reached;
  });

  test("ctx.cancel() with no other fault is green (exit 0)", async () => {
    await om(async ({ cancel }) => {
      action("daemon")
        .run(
          (ctx) => new Promise<void>((res) => ctx.signal.addEventListener("abort", () => res()))
        )()
        .exec();
      cancel();
    });
    expect(process.exitCode).toBe(0);
  });

  test("a failed assert remains a fault (exit 1) — regression guard", async () => {
    await om(async ({ assert }) => {
      assert(false, "nope");
    });
    expect(process.exitCode).toBe(1);
  });

  test("a failed action cancels its own children even when the failure is caught", async () => {
    let childCancelled = false;
    await om(async () => {
      const parent = action("parent").run(async (ctx) => {
        // fire-and-forget child of `parent`
        action("child")
          .run(
            (c) =>
              new Promise<void>((resolve) => {
                c.signal.addEventListener("abort", () => {
                  childCancelled = true;
                  resolve();
                });
              })
          )()
          .exec();
        await new Promise((r) => setTimeout(r, 10)); // let the child start
        throw new Error("parent boom");
      });
      try {
        await parent().exec().done; // observed + caught → run keeps going
      } catch {
        /* handled */
      }
    });
    expect(childCancelled).toBe(true); // subtree aborted by parent's failure…
    expect(process.exitCode).toBe(0); // …but the caught failure is not a fault
  });
});
```

Also add a tiny test-only accessor so tests can read the run view without touching disk. In `ExecutionTree.ts`, add:

```ts
  /** Test seam: the projected run view (same object written to result.json). */
  runViewForTest(): RunView {
    return this.runView();
  }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/omkit/tests/unit/teardown.test.ts`
Expected: FAIL — fire-and-forget failure does not tear down (today it's swallowed); caught failure reddens the verdict (today's registry scan); `runViewForTest` undefined.

- [ ] **Step 3: Add the `observed` model to `ActionRun.ts`**

3a. In `NodeInit`, add the callback (next to `onAssert`):

```ts
  /** Called when this node fails while unobserved — the tree tears down + records a fault. */
  readonly onUnhandledFailure: (path: string, error: unknown) => void;
```

3b. Add the fields + store the callback. Near the other private fields:

```ts
  private observed = false;
  // Set only by the parent-signal abort listener (an ANCESTOR cancelling this node).
  // Distinguishes a run/ancestor teardown from this node's own subtree-abort on failure,
  // so the unobserved-failure check below isn't fooled by our own controller.abort().
  private cascadeCancelled = false;
```

In the constructor, store it (alongside `this.onAssert = init.onAssert;`):

```ts
this.onUnhandledFailure = init.onUnhandledFailure;
```

Declare the private member (next to `onAssert`):

```ts
  private readonly onUnhandledFailure: (path: string, error: unknown) => void;
```

3c. In the constructor, self-catch the node's OWN settled rejection so an unobserved failure never surfaces as a Node `unhandledRejection`. This uses the stored deferred directly (NOT the getter), so it does not mark the node observed. Next to the existing `void this.handle.promise.catch(() => {});`:

```ts
// An unobserved failure is routed to teardown explicitly; swallow the raw rejection
// here (via the field, not the `done` getter) so it isn't also an unhandledRejection.
void this.settled.promise.catch(() => {});
```

3c-bis. In the constructor, update the parent-signal abort chaining so an **ancestor** abort sets `cascadeCancelled`. Replace the existing block:

```ts
// Chain cancellation: parent abort ⇒ this subtree aborts.
const parent = init.parentSignal;
if (parent) {
  if (parent.aborted) this.controller.abort();
  else parent.addEventListener("abort", () => this.controller.abort(), { once: true });
}
```

with:

```ts
// Chain cancellation: an ancestor's abort ⇒ this subtree aborts (and is flagged as a
// cascade, so a concurrent own-failure isn't misread as a fresh unhandled fault).
const parent = init.parentSignal;
const onAncestorAbort = (): void => {
  this.cascadeCancelled = true;
  this.controller.abort();
};
if (parent) {
  if (parent.aborted) onAncestorAbort();
  else parent.addEventListener("abort", onAncestorAbort, { once: true });
}
```

3d. Mark observed from the public outcome getters:

```ts
  get done(): Promise<Result> {
    this.observed = true;
    return this.settled.promise;
  }

  /** The attached handle; rejects on failure/cancel. */
  get ref(): Promise<Handle> {
    this.observed = true;
    return this.handle.promise;
  }
```

3e. Mark observed when an error handler is attached (only `"error"` — event-only listeners never deliver the failure, so they must not count):

```ts
  on<K extends keyof InstanceEvents<Events, Result>>(
    key: K,
    handler: EventHandler<InstanceEvents<Events, Result>[K]>
  ): void {
    if (key === "error") this.observed = true;
    this.emitter.listen(key, handler);
  }
```

In `once`, add the same guard as the first line of the method body (before the `if (key === "done")` branch):

```ts
if (key === "error") this.observed = true;
```

3f. In `fail()`, stop the aborted branch and the failed branch from doing any verdict work, and at the end of the _failed_ (not-aborted) branch schedule the observed-check. Replace the failed branch's tail so it reads:

```ts
this.status = "failed";
this.error = error;
this.log("error", "error", messageOf(error));
this.bubble(`✗ ${firstLine(messageOf(error))}`);
this.sysEmit("error", error);
this.lifecycle("done · failed");
this.bubble("✗ done · failed");
this.sysEmit("done", undefined);
this.settled.reject(error);
this.handle.reject(error);
// A failed action's work is over: abort its OWN subtree (children → CancelledError,
// procs killed). This is local cleanup, independent of the run verdict. It sets our
// signal.aborted, which is why the check below uses `cascadeCancelled`, not
// `signal.aborted`, to tell an unhandled fault from a run/ancestor teardown.
this.controller.abort();
// If, one microtask on, no one is positioned to receive this error (no `.done`/`.ref`
// read, no `on("error")`) and we weren't caught in an ancestor's teardown, it's
// unhandled — tell the tree to tear the run down and record the fault.
// `sysEmit("error")` above already ran, so a live error handler has set `observed`.
queueMicrotask(() => {
  if (!this.observed && !this.cascadeCancelled) this.onUnhandledFailure(this.path, error);
});
```

(The aborted branch above it is unchanged — it already rejects with `CancelledError` and records nothing. It is reached only when the signal was _already_ aborted at `fail()` entry, so the new `controller.abort()` in the failed branch cannot divert a genuine failure into it.)

- [ ] **Step 4: Switch the verdict to the fault list in `ExecutionTree.ts`**

4a. Rename the field `extraFailures` → `faults` (declaration and every use). Add a helper:

```ts
  private recordFault(action: string, error: unknown): void {
    this.faults.push({ action, error: messageOf(error) });
  }
```

4b. In `nodeDeps()`, add the `onUnhandledFailure` wiring so every node (including the root) routes an unhandled failure to a fault + teardown:

```ts
  private nodeDeps(): {
    store: LogStore;
    snapshots: SnapshotStore;
    onAssert: NodeInit["onAssert"];
    onUnhandledFailure: NodeInit["onUnhandledFailure"];
  } {
    return {
      store: this.store,
      snapshots: this.snapshotStore,
      onAssert: (pass, actionPath, message) => this.recordAssert(pass, actionPath, message),
      onUnhandledFailure: (actionPath, error) => {
        this.recordFault(actionPath, error);
        this.teardown(`${actionPath} failed`);
      },
    };
  }
```

4c. In `recordAssert`, replace the `this.extraFailures.push(...)` with `this.recordFault(actionPath, \`assertion failed: ${message}\`)`, keeping the existing `if (!this.root.signal.aborted)` guard.

4d. In `onFatal`, replace `this.extraFailures.push({ action: kind, error: messageOf(error) })` with `this.recordFault(kind, error)` (keep the `if (!this.root.signal.aborted)` guard).

4e. Replace `verdictOk()` and the failures assembly in `runView()`:

```ts
  private verdictOk(): boolean {
    return this.faults.length === 0;
  }
```

```ts
  private runView(): RunView {
    return {
      ok: this.faults.length === 0,
      failures: [...this.faults],
      assertions: { passed: this.assertionsPassed, failed: this.assertionsFailed },
      startedAt: this.root.startedAt,
      endedAt: this.root.endedAt,
      duration: this.root.duration,
      rawStream: this.rawStreamPath(),
      root: this.nodeView(this.root),
    };
  }
```

(The `registry.filter((n) => n.status === "failed")` scan is deleted — a caught failure leaves a `failed` node that must not redden the verdict.)

- [ ] **Step 5: Run the failure-model tests to verify they pass**

Run: `npx vitest run packages/omkit/tests/unit/teardown.test.ts`
Expected: PASS (all `teardown mechanics` + `failure model` tests).

- [ ] **Step 6: Run the existing smoke suite to confirm no regressions**

Run: `npx vitest run packages/omkit/tests/unit/refactored-smoke.test.ts`
Expected: PASS. Note the smoke test `"a failing action's .done rejects with its error"` catches the error (observed + caught) — under the new model it's green with no teardown, and the test only asserts the message, so it still passes. `"assert tallies and a failure sets the verdict"` still expects `exitCode === 1` (assert is a fault).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck --workspace omkit`
Expected: no errors.

- [ ] **Step 8: Stage and pause for the user**

```bash
git add packages/omkit/src/core/ActionRun.ts packages/omkit/src/core/ExecutionTree.ts packages/omkit/tests/unit/teardown.test.ts
```

Then STOP and ask the user before committing.

---

## Task 3: Full verification & lint

**Files:** none (verification only).

- [ ] **Step 1: Run the entire test suite**

Run (repo root): `npm test`
Expected: PASS — all omkit unit tests, plus the tskb unit and e2e suites unaffected.

- [ ] **Step 2: Lint the omkit package**

Run: `npm run lint --workspace omkit`
Expected: no errors. (Watch for unused-symbol lint from the deleted `force`/`beginTeardown`/`extraFailures` members.)

- [ ] **Step 3: Typecheck the whole workspace surface that uses omkit**

Run: `npm run typecheck --workspace omkit`
Expected: no errors.

- [ ] **Step 4: Report results to the user**

Summarize: tests passing, lint clean, and the behavior now delivered (unhandled failure → teardown; caught → green; Ctrl+C/`cancel()` → graceful teardown with a log; deleted escalation/`force`/`process.exit`). Do not commit unless asked.

---

## Self-Review

**Spec coverage:**

- Unhandled failure → teardown → Task 2 (fire-and-forget test, `onUnhandledFailure`).
- Ctrl+C → teardown, extra presses ignored → Task 1 (`onSigint` → `teardown`; idempotency test via `cancel()`, which shares the path).
- `ctx.cancel()` → teardown → Task 1 (`cancel()` delegates) + Task 2 (green-when-clean test).
- Always graceful / always a log → Task 1 (single grace timer, `finalize` guarded, handler-removal after writes, force-finalize test).
- Caught → green; verdict = fault list → Task 2 (caught-green test, `verdictOk`/`runView` rewrite, deleted registry scan).
- Deleted `force`/`forced`/`forcedWake`/`sigints`/escalation/`process.exit` → Task 1.
- "observed only via error-bearing surfaces" → Task 2 (`on/once("error")` + `.done`/`.ref` getters only).
- Failed action aborts its own subtree (children cancelled, procs killed) even when caught → Task 2 (`controller.abort()` in `fail()`, `cascadeCancelled` flag, subtree-abort test).

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `teardown(reason: string)` used in `onSigint`, `cancel`, `nodeDeps`, `onFatal`, and the grace timer. `onUnhandledFailure(path, error)` matches the `NodeInit` field and the tree's wiring. `faults` used consistently after the `extraFailures` rename. `graceMs` (static) referenced in `teardown` and the Task 1 test. `runViewForTest()` added before it's used in Task 2 tests.
