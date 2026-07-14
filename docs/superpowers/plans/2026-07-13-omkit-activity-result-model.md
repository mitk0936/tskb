# omkit Activity Outcome & Failure Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Activity's throwing `.done` handle with a non-throwing `.result` (`Outcome<T>`) accessor and add `.handleFailure` as the fire-and-forget failure owner, preserving omkit's existing teardown/supervision behavior.

**Architecture:** `.result` maps the node's internal `settled` promise into an `Outcome<T>` value that never rejects; reading it still marks the node _observed_ (so an awaited failure stays green). `.handleFailure(fn)` marks the node observed and registers a side-effect handler that runs on a genuine (non-cancel) failure, for activities you never `await`. The teardown engine, grace timer, SIGINT handling, verdict/fault model, and the "observed → handled, unobserved → teardown" rule are unchanged.

**Tech Stack:** TypeScript (ESM, `.ts` imports), Vitest, npm workspaces.

## Global Constraints

- Package manager / workspaces: run commands from repo root `d:\tskb`; omkit is workspace `omkit`, the pipelines live in workspace `wm`.
- Imports use explicit `.ts` extensions (e.g. `from "./types.ts"`), matching the existing code.
- Outcome type name is `Outcome<T>` (NOT `Result`) — `RunHandle`'s generic parameter is already named `Result`; do not rename that generic.
- `.result` MUST never reject. `.handleFailure` handler is `(error: unknown) => void` (side-effect only, no recovery value) and MUST NOT run on cancellation.
- Do not change teardown mechanics, log/artifact formats, the grace timer, SIGINT handling, or the verdict/fault model. Do not modify the action library (`command`, `healthcheck`, etc.) — the healthcheck gate simply reads `.result`.
- Test runner: `npx vitest run <path>` (single file) or `npm test` (all) from repo root.
- Commit only within these tasks (the repo convention is to work in the tree on branch `wm`); do not create branches or push.

---

## File Structure

- `packages/omkit/src/core/types.ts` — add `Outcome<T>`; on `RunHandle` remove `done`, add `result` + `handleFailure`.
- `packages/omkit/src/index.ts` — export `Outcome`.
- `packages/omkit/src/core/ActionRun.ts` — replace `done` getter with `result`; add `failureHandler` field + `handleFailure` method; run the handler in `fail()`; comment fixes.
- `packages/omkit/src/core/step.ts` — retarget to `.result` and unwrap.
- `packages/omkit/src/core/ExecutionTree.ts`, `packages/omkit/src/foundation/CancelledError.ts` — comment-only `.done`→`.result` fixes.
- `packages/omkit/tests/unit/teardown.test.ts` — rewrite the `failure model` suite for the new surface (the `teardown mechanics` suite is unchanged).
- `wm/src/pipelines/tskb-dev.ts` — refactor the run body to `.result`.
- `wm/src/pipelines/tskb-build.ts` — refactor the run body to `.result`.

---

## Task 1: omkit core — `Outcome` model (`.result` / `.handleFailure`)

**Files:**

- Modify: `packages/omkit/src/core/types.ts`
- Modify: `packages/omkit/src/index.ts`
- Modify: `packages/omkit/src/core/ActionRun.ts`
- Modify: `packages/omkit/src/core/step.ts`
- Modify: `packages/omkit/src/core/ExecutionTree.ts` (comment only)
- Modify: `packages/omkit/src/foundation/CancelledError.ts` (comment only)
- Test: `packages/omkit/tests/unit/teardown.test.ts`

**Interfaces:**

- Produces:
  - `type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown }` (exported from `omkit`).
  - `RunHandle.result: Promise<Outcome<Result>>` — always resolves; reading it marks the node observed.
  - `RunHandle.handleFailure(handler: (error: unknown) => void): this` — observes + registers a non-cancel failure side-effect handler.
  - `RunHandle.done` is removed.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Rewrite the `failure model` suite in `teardown.test.ts` against the new surface**

Replace the import line and the **entire** `describe("failure model", () => { … })` block (leave `describe("teardown mechanics", …)` and the file header/`afterEach` untouched).

Change the import at the top of the file to add `CancelledError`:

```ts
import { om, action, CancelledError } from "../../src/index.ts";
```

Replace the whole `describe("failure model", …)` block with:

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

  test("a successful activity's .result resolves { ok: true, value }", async () => {
    let outcome: unknown;
    await om(async () => {
      outcome = await action("compute")
        .run(async () => 42)()
        .exec().result;
    });
    expect(outcome).toEqual({ ok: true, value: 42 });
    expect(process.exitCode).toBe(0);
  });

  test("an awaited failure resolves { ok: false } — observed, green, sibling untouched", async () => {
    let daemonTornDown = false;
    let outcome: unknown;
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
      outcome = await action("boom")
        .run(async () => {
          throw new Error("handled");
        })()
        .exec().result; // reading .result observes → green
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
        .exec()
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
      action("daemon")
        .run(
          (ctx) =>
            new Promise<void>((res) =>
              ctx.signal.addEventListener("abort", () => {
                daemonTornDown = true;
                res();
              })
            )
        )()
        .exec();
      action("boom")
        .run(async () => {
          throw new Error("owned");
        })()
        .exec()
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

  test("re-throwing an outcome error faults the run (exit 1)", async () => {
    await om(async () => {
      const r = await action("boom")
        .run(async () => {
          throw new Error("rethrown");
        })()
        .exec().result;
      if (!r.ok) throw r.error; // body throws → root fault
    });
    expect(process.exitCode).toBe(1);
  });

  test("a saved handle read only after it fails still tears down (exit 1)", async () => {
    await om(async () => {
      const h = action("boom")
        .run(async () => {
          throw new Error("late");
        })()
        .exec(); // .result not yet read → unobserved at fail-time
      await new Promise((r) => setTimeout(r, 20)); // boom fails here → teardown
      await h.result; // too late; resolves { ok: false } but the fault is recorded
    });
    expect(process.exitCode).toBe(1);
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("late"))).toBe(true);
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

  test("a cancelled activity's .result is CancelledError and handleFailure did not run", async () => {
    let handlerRan = false;
    let outcome: unknown;
    await om(async ({ cancel }) => {
      const h = action("daemon")
        .run(
          (ctx) => new Promise<void>((res) => ctx.signal.addEventListener("abort", () => res()))
        )()
        .exec()
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
      await probe.exec().once("healthy"); // resolves undefined on settle; does NOT observe the error
    });
    expect(process.exitCode).toBe(1);
  });

  test("on('error') observes the failure — no teardown, green", async () => {
    let seen: unknown;
    await om(async ({ cancel }) => {
      const h = action("boom")
        .run(async () => {
          throw new Error("handled via on-error");
        })()
        .exec();
      h.on("error", (e) => {
        seen = e;
      });
      await new Promise((r) => setTimeout(r, 20)); // boom fails here; on('error') observed it
      cancel();
    });
    expect((seen as Error).message).toBe("handled via on-error");
    expect(process.exitCode).toBe(0);
  });

  test("a failed action cancels its own children even when the failure is observed", async () => {
    let childCancelled = false;
    await om(async () => {
      const parent = action("parent").run(async (ctx) => {
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
      const r = await parent().exec().result; // observed → run keeps going
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
      const h = daemon.exec();
      await h.ref; // downstream reads the handle (refObserved), then moves on
      await new Promise((r) => setTimeout(r, 40)); // daemon fails here → must tear down
    });
    expect(process.exitCode).toBe(1);
    const failures = ExecutionTree.last!.runViewForTest().failures;
    expect(failures.some((f) => f.error.includes("post-attach boom"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/omkit/tests/unit/teardown.test.ts`
Expected: FAIL — compile/type errors that `result` and `handleFailure` do not exist on the run handle (and `.done` still referenced nowhere), e.g. "Property 'result' does not exist".

- [ ] **Step 3: Add `Outcome` and update `RunHandle` in `types.ts`**

In `packages/omkit/src/core/types.ts`, add the `Outcome` type right after the `NoEvents` definition:

```ts
/** An activity's terminal outcome: a value on success, an error on failure/cancel. Never thrown. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
```

In the `RunHandle` interface, update the leading doc comment and replace the `done` member and add `handleFailure`. Change:

```ts
/**
 * A launched action: the live node's awaitable/observable surface. `.done`/`.ref`
 * **reject** on failure (and with a `CancelledError` on cancel).
 */
export interface RunHandle<Result = unknown, Events extends object = NoEvents, Handle = void> {
  readonly id: string;
  /** The result; rejects on failure/cancel. */
  readonly done: Promise<Result>;
  /** The attached handle; rejects on failure/cancel. */
  readonly ref: Promise<Handle>;
```

to:

```ts
/**
 * A launched action: the live node's awaitable/observable surface. `.result` always
 * resolves an {@link Outcome} (never throws); `.ref` rejects on failure/cancel.
 */
export interface RunHandle<Result = unknown, Events extends object = NoEvents, Handle = void> {
  readonly id: string;
  /** The terminal outcome; always resolves (never rejects). Reading it observes the failure. */
  readonly result: Promise<Outcome<Result>>;
  /** The attached handle; rejects on failure/cancel. */
  readonly ref: Promise<Handle>;
  /**
   * Handle a fire-and-forget activity's failure: attach a handler so a crash runs it
   * instead of tearing the run down. Observes the failure; chainable; attach in the
   * same tick as `.exec()`. Not called on cancellation.
   */
  handleFailure(handler: (error: unknown) => void): this;
```

- [ ] **Step 4: Export `Outcome` from the package entry**

In `packages/omkit/src/index.ts`, add `Outcome` to the type re-export:

```ts
export type {
  Action,
  ActionInstance,
  ActionContext,
  OmContext,
  RunHandle,
  Outcome,
} from "./core/types.ts";
```

- [ ] **Step 5: Implement `.result` + `.handleFailure` in `ActionRun.ts`**

In `packages/omkit/src/core/ActionRun.ts`:

(a) Add `Outcome` to the type import from `./types.ts`:

```ts
import type {
  ActionContext,
  Exec,
  InstanceEvents,
  NodeStatus,
  Outcome,
  RunHandle,
} from "./types.ts";
```

(b) Add a `failureHandler` field next to the other private fields (after the `settled`/`handle` deferreds, around line 69):

```ts
  private failureHandler: ((error: unknown) => void) | undefined;
```

(c) Replace the `done` getter:

```ts
  get done(): Promise<Result> {
    this.observed = true;
    return this.settled.promise;
  }
```

with the `result` getter:

```ts
  get result(): Promise<Outcome<Result>> {
    this.observed = true;
    return this.settled.promise.then(
      (value): Outcome<Result> => ({ ok: true, value }),
      (error): Outcome<Result> => ({ ok: false, error })
    );
  }
```

(d) Add the `handleFailure` method next to `tag`/`cancel` (after the `tag` method, before `cancel`):

```ts
  handleFailure(handler: (error: unknown) => void): this {
    this.failureHandler = handler;
    this.observed = true;
    return this;
  }
```

(e) In `fail(error)`, run the handler on a genuine (non-cancel) failure. Insert the handler call immediately before the closing `queueMicrotask(...)` unobserved-check block:

```ts
// A registered handler owns a fire-and-forget failure (side effect only; not on cancel).
this.failureHandler?.(error);
// If, one microtask on, no one is positioned to receive this error (no `.result`/`.ref`
```

(the second line replaces the existing comment `// If, one microtask on, no one is positioned to receive this error (no `.done`/`.ref``).

(f) Comment fixes in the same file: in the class doc comment change `the run handle (`done`/`ref`/`once`/`tag`/`cancel`)` to `the run handle (`result`/`ref`/`once`/`tag`/`cancel`)`, and change `it never throws (the failure is delivered through `.done`)` to `it never throws (the failure is delivered through `.result`)`.

- [ ] **Step 6: Retarget `step.ts` to `.result`**

Replace the body of `step` in `packages/omkit/src/core/step.ts`:

```ts
export function step<Result>(
  name: string,
  fn: (ctx: ActionContext) => Awaitable<Result>
): Promise<Result> {
  return action(name)
    .run(fn as (ctx: ActionContext) => Awaitable<Result>)()
    .exec()
    .result.then((r) => {
      if (!r.ok) throw r.error;
      return r.value;
    });
}
```

Update the step doc comment sentence `resolves the result (rejects on failure/cancel)` to `resolves the result (throws on failure/cancel)`.

- [ ] **Step 7: Comment-only `.done`→`.result` fixes**

In `packages/omkit/src/core/ExecutionTree.ts`, in the `trackNode` doc comment change `via the private field, not the `.done` getter,` to `via the private field, not the `.result` getter,`.

In `packages/omkit/src/foundation/CancelledError.ts`, change the class doc comment:

```ts
/**
 * The error a cancelled node reports — its `.ref` rejects with it and its `.result`
 * resolves `{ ok: false, error: CancelledError }` — so an awaiter can tell cancellation
 * from a genuine failure. A cancelled node is never a verdict failure.
 */
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run packages/omkit/tests/unit/teardown.test.ts`
Expected: PASS (all `failure model` + `teardown mechanics` tests green).

- [ ] **Step 9: Typecheck the package and run the full suite**

Run: `npm run typecheck -w omkit`
Expected: no errors.

Run: `npm test`
Expected: PASS (whole workspace suite green).

- [ ] **Step 10: Commit**

```bash
git add packages/omkit/src/core/types.ts packages/omkit/src/index.ts packages/omkit/src/core/ActionRun.ts packages/omkit/src/core/step.ts packages/omkit/src/core/ExecutionTree.ts packages/omkit/src/foundation/CancelledError.ts packages/omkit/tests/unit/teardown.test.ts
git commit -m "feat(omkit): replace .done with non-throwing .result + .handleFailure

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Refactor `tskb-dev.ts` to the outcome model

**Files:**

- Modify: `wm/src/pipelines/tskb-dev.ts`

**Interfaces:**

- Consumes: `RunHandle.result` / `RunHandle.tag` / `RunHandle.ref` from Task 1; the action factories `command`, `healthcheck`, `chromePage`, `prompt` (unchanged) and `chromedriver`, `inspectPage`.
- Produces: nothing downstream.

- [ ] **Step 1: Rewrite the `om(...)` run body**

Replace the `om(async () => { … });` block at the bottom of `wm/src/pipelines/tskb-dev.ts` (the action/const definitions above it are unchanged) with:

```ts
om(async () => {
  const answer = await askToRunTests.exec().tag("run:tests:prompt").result;

  if (answer.ok && answer.value === "yes") {
    const tests = await runTests.exec().tag("test").result;
    if (!tests.ok) {
      // Test failures are expected; omkit already logged them. Keep booting.
    }
  }

  watchDocs.exec().tag("watch:docs:daemon");
  watchLib.exec().tag("watch:tskb:lib:daemon");
  serveExplorer.exec().tag("server:explorer:daemon");

  const ready = await explorerReady.exec().tag("explorer:ready:gate").result;
  if (!ready.ok) return;

  const chrome = chromedriver({ url: explorerUrl }).exec().tag("chromedriver:browser");
  const page = chromePage("Explorer", chrome.ref).exec().tag("browser:explorer");
  await inspectPage(page.ref).exec().tag("explorer:inspect").result;

  console.log("Platform running.");
  console.log("Watchers are live.");
  console.log("Explorer page is available.");
  console.log("Press Ctrl+C to stop.");
});
```

- [ ] **Step 2: Build omkit so `wm` sees the new types, then typecheck `wm`**

Run: `npm run build -w omkit`
Expected: builds `packages/omkit/dist` with no errors.

Run: `npm run typecheck -w wm`
Expected: no errors (`.result`, `.tag`, `.ref` all resolve; no reference to `.done`/`.catchError`).

- [ ] **Step 3: Commit**

```bash
git add wm/src/pipelines/tskb-dev.ts
git commit -m "refactor(wm): tskb-dev pipeline to omkit .result outcome model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Refactor `tskb-build.ts` to the outcome model

**Files:**

- Modify: `wm/src/pipelines/tskb-build.ts`

**Interfaces:**

- Consumes: `RunHandle.result` / `RunHandle.tag` from Task 1; `OmContext.cancel` / `OmContext.snapshot` (unchanged); `watchDir`, `buildDocs` (unchanged).
- Produces: nothing downstream.

- [ ] **Step 1: Rewrite the `om(...)` run body**

Replace the `om(async ({ cancel, snapshot }) => { … });` block at the bottom of `wm/src/pipelines/tskb-build.ts` (the `watchBuildDir`/`buildConfig`/`buildRepoDocs` definitions above it are unchanged) with:

```ts
om(async ({ cancel, snapshot }) => {
  // Capture the run's inputs as a snapshot — part of the world model the log
  // narrates. Taken inside the body so it lands in this run's own output folder.
  void snapshot("build-config", buildConfig);

  // Watch the graph the build rewrites; each change lands in the log as an event.
  watchBuildDir.exec().tag("watch:build:daemon");
  // Run the build to completion (its proc exiting settles `.result`)…
  const built = await buildRepoDocs.exec().tag("build").result;
  if (!built.ok) throw built.error; // build failed → fault the run (exit 1)
  // …then tear everything down — build's done, so the watcher's job is too.
  cancel();
});
```

- [ ] **Step 2: Build omkit (if not already from Task 2) and typecheck `wm`**

Run: `npm run build -w omkit`
Expected: no errors.

Run: `npm run typecheck -w wm`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add wm/src/pipelines/tskb-build.ts
git commit -m "refactor(wm): tskb-build pipeline to omkit .result outcome model

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**

- `Outcome<T>` type + export — Task 1 Steps 3, 4.
- `.result` never rejects, resolves value/error/CancelledError — Task 1 Steps 5(c), 1 (tests: success, awaited-failure, never-rejects, cancelled).
- `.handleFailure` observes + runs handler, not on cancel — Task 1 Steps 5(b,d,e), 1 (tests: handleFailure runs, cancelled did-not-run).
- `.done` removed — Task 1 Steps 3, 5(c).
- Observed rule preserved (on-error, once('healthy'), saved-handle, post-attach, subtree cancel, fire-and-forget) — Task 1 Step 1 regression tests (unchanged semantics).
- `step` retarget — Task 1 Step 6.
- Comment fixes (ExecutionTree, CancelledError, ActionRun class doc) — Task 1 Steps 5(f), 7.
- healthcheck unchanged; gate reads `.result` — Task 2 Step 1 (no healthcheck edit).
- tskb-dev / tskb-build refactors — Tasks 2, 3.

**Placeholder scan:** none — all steps contain concrete code and exact commands.

**Type consistency:** `Outcome<T>` used identically in `types.ts`, `ActionRun.ts` (`Outcome<Result>`), and `step.ts` (via `r.ok`/`r.value`/`r.error`). `handleFailure(handler: (error: unknown) => void): this` matches between `types.ts` and `ActionRun.ts`. `.result: Promise<Outcome<Result>>` matches between the interface and the getter.

---

## Execution Handoff

Choose an execution approach after reviewing this plan (see the two options in the closing message).
