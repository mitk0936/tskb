# omkit — Activity Outcome & Failure Handling (`.result` / `.handleFailure`)

**Date:** 2026-07-13
**Status:** Approved design, ready for implementation plan
**Scope:** `packages/omkit/src/core` (`types.ts`, `ActionRun.ts`, `step.ts`), the public `index.ts`, comment touch-ups in `ExecutionTree.ts` / `om.ts` / `CancelledError.ts`, the `teardown.test.ts` suite, and the two `wm` pipelines. The teardown **mechanics** are unchanged.
**Companion:** changes the Activity API surface that `2026-07-13-cancellation-teardown-redesign-design.md` listed as a non-goal (removes `.done`, adds `.result` / `.handleFailure`) and _extends_ its "observed" rule with `.handleFailure` as one more observer. That doc's teardown engine (single `teardown(reason)`, grace timer, SIGINT handling, always-write-log, subtree-abort-on-failure) stays exactly as-is.

## Problem

The execution model draws a clean line between an **Action** (immutable description of work) and an **Activity** (a live execution, created synchronously by `action.exec()`). Everything before `exec()` configures the Action; everything after configures or observes the Activity.

The current Activity surface exposes `.done`, which **rejects** on failure. That forces every outcome through `try/catch` and makes "this activity is expected to fail sometimes" implicit. We want:

- `activity.result` — the terminal outcome as a typed value (`{ ok, value }`) that **never throws**, so operational failures are inspected, not caught.
- `activity.handleFailure(handler)` — attach a handler to a **fire-and-forget** activity so its failure runs the handler instead of tearing the run down.

The failure/teardown semantics (structured supervision: an _unobserved_ failure propagates to the parent) are already correct and stay. This change reshapes the **consumer surface** on top of them.

## The model

An Activity is `action.exec()` (synchronous). Its surface:

```
activity.tag(name)                 // chainable; timeline-visible tag
activity.handleFailure(handler)    // chainable; observe + handle a fire-and-forget failure
activity.cancel()                  // abort this node + its subtree
activity.ref                       // Promise<Handle> — the attached imperative handle
activity.result                    // Promise<Outcome<T>> — the terminal outcome (never rejects)
activity.on(event, handler)        // subscribe to declared/system events
activity.once(event)               // next event; resolves undefined if it settles first
```

`.done` is **removed**. The terminal outcome type is `Outcome<T>` (naming avoids colliding with `RunHandle`'s existing `Result` generic parameter, and matches omkit's prior `outcome` vocabulary):

```ts
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
```

## `.result` semantics

`.result` **always resolves** to the terminal `Outcome<T>` — it never rejects.

| Activity ends…                                    | `.result` resolves                     |
| ------------------------------------------------- | -------------------------------------- |
| returns `value`                                   | `{ ok: true, value }`                  |
| **fails** (throw / rejected proc / non-zero exit) | `{ ok: false, error }`                 |
| **cancelled** (`.cancel()` / ancestor teardown)   | `{ ok: false, error: CancelledError }` |

Reading `.result` marks the node **observed** (see the rule below), so awaiting an activity's `.result` both hands you the outcome _and_ keeps a failure from tearing the run down — inspect `outcome.ok` and proceed.

`step(name, fn)` retargets from `.done` to `.result` and unwraps: `if (!r.ok) throw r.error; return r.value`. A failed inline `step` therefore still throws into the `om` body and propagates — identical to today — while a successful one returns the value.

## `.handleFailure` semantics

```ts
handleFailure(handler: (error: unknown) => void): this
```

`.handleFailure` exists for activities you launch **fire-and-forget** — ones you never `await`. It does two things:

1. **Observes** — the node counts as observed, so a failure is not an unhandled fault and does not trigger teardown.
2. **Handles** — on a genuine failure the `handler(error)` runs (side effect only; no recovery value). The handler does **not** run on cancellation (a clean stop, not a failure).

It is chainable (returns the Activity) and must be attached **synchronously in the same tick as `.exec()`**, before any `await`. The fluent form `action.exec().handleFailure(…)` is reliable even for a _synchronously-throwing_ body (which fails **inline** during `.exec()`, before the handler attaches): `handleFailure` sees the node already in status `"failed"` and delivers the recorded error immediately. (A `on/once("error")` attached the same way gets the same guarantee for free — the event emitter snapshots the last `"error"` payload and replays it to a late listener.) What is _not_ safe is saving the handle and attaching `.handleFailure` only **after** an `await` — the failure may already be an unobserved fault by then, the same "saved handle awaited later" timing documented for teardown.

`.handleFailure` does **not** shape `.result` (that always resolves `{ ok: false, error }` on failure regardless). If you `await` an activity you do not need `.handleFailure` — reading `.result` already observes the failure and hands you the value. `.handleFailure` is the equivalent for the fire-and-forget case, where there is no `await` to observe through.

## The failure/teardown rule (observed → handled)

This is the one rule that decides the run verdict, and it is exactly the teardown doc's "observed" rule with `.handleFailure` added as one more observer.

A failed node is **observed** — someone is positioned to receive the error, so it is _not_ an unhandled fault and the run stays green — if, before it failed, any of these happened:

- `.result` was read (its getter accessed), **or**
- `.ref` was read and the handle has not been attached yet, **or**
- `on("error")` / `once("error")` was attached, **or**
- `.handleFailure` was attached.

An **unobserved** failure (none of the above) → `onUnhandledFailure` → record the fault and `teardown`. Unchanged from today.

| Pattern                                        | Outcome                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| `await x.exec()…​.result`                      | `{ ok: false, error }` on failure; observed → green; caller inspects `ok` |
| `x.exec().handleFailure(fn)` (fire-and-forget) | `fn` runs on failure; observed → green                                    |
| `x.exec().on("error", fn)`                     | observed → green (telemetry)                                              |
| fire-and-forget crash, nothing attached        | unobserved → fault → teardown (exit 1)                                    |
| `.cancel()` / Ctrl+C, no other fault           | clean teardown, green (exit 0)                                            |

`.ref`, `.on`, `.once`, `.tag`, `.cancel` are unchanged in behavior.

## Cancellation

A cancelled node (its own `.cancel()`, or an ancestor's teardown cascading down) is a clean stop, not a fault: `.result` resolves `{ ok: false, error: CancelledError }`, `.ref` rejects with `CancelledError`, and a `.handleFailure` handler does **not** run. This matches the existing "a killed action is `cancelled`, not `failed`" classification, so shutdown noise never dirties the verdict.

## Core changes

**`core/types.ts`**

- `RunHandle<Result, Events, Handle>`: remove `done`; add `result: Promise<Outcome<Result>>` and `handleFailure(handler: (error: unknown) => void): this` (the generic stays named `Result`; the outcome type is `Outcome`).
- Add and export `type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown }`.
- Update the doc comments that describe `.done`.

**`core/ActionRun.ts`**

- Replace the `.done` getter with `.result`, which maps the internal `settled` promise into an `Outcome` and never rejects: `this.observed = true; return this.settled.promise.then(v => ({ ok: true, value: v }), e => ({ ok: false, error: e }))`.
- Add `private hasFailureHandler = false` + a stored handler; add `handleFailure(fn)` that sets the flag, stores the handler, sets `observed = true`, and returns `this`.
- `fail(error)`: keep the cancel-vs-fail classification and the subtree-abort. On a genuine (non-cancel) failure, if a handler is registered, run it. The existing one-microtask unobserved-check (`!observed && !cascadeCancelled → onUnhandledFailure`) is unchanged — `handleFailure` implies `observed`.
- Keep the internal `settled`/`handle` self-catch so an unobserved, unread failure does not surface as a Node `unhandledRejection`.

**`core/step.ts`** — `.exec().result` then `r => { if (!r.ok) throw r.error; return r.value }`.

**`core/index.ts`** — export the `Outcome` type.

**`core/ExecutionTree.ts`, `core/om.ts`, `foundation/CancelledError.ts`** — comment-only: replace `.done` references with `.result`. No behavior change (teardown, faults, verdict, grace timer, SIGINT all stay).

## Consumers

**`healthcheck`** stays a normal action that returns a promise; the pipeline reads its `.result` directly. A healthy probe resolves `{ ok: true, value }`; the gate does not depend on a throw path.

**`wm/src/pipelines/tskb-dev.ts`** (behavior preserved). Awaited activities read `.result`; the long-lived daemons stay fire-and-forget:

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

Named Activities for the long-lived executions (`chrome`, `page`) let downstream actions consume their `.ref`. The daemons (`watchDocs`, `watchLib`, `serveExplorer`) stay fire-and-forget with nothing attached — a crash in any of them is unobserved and tears the run down, which is the intended supervision behavior. `.handleFailure` is available for the opposite intent (a fire-and-forget activity whose crash should be logged-and-survived, not fatal).

**`wm/src/pipelines/tskb-build.ts`** — the build is awaited, so it reads `.result`. A build failure must stay **red** (as the old uncaught `.done` did), so the body re-throws it:

```ts
om(async ({ cancel, snapshot }) => {
  void snapshot("build-config", buildConfig);
  watchBuildDir.exec().tag("watch:build:daemon");
  const built = await buildRepoDocs.exec().tag("build").result;
  if (!built.ok) throw built.error; // build failed → fault the run (exit 1)
  cancel(); // build ok → tear the watcher down
});
```

## Testing

`packages/omkit/tests/unit/teardown.test.ts` — `.done`→`.result` swaps plus new coverage. The teardown/verdict assertions are unchanged; these lock the new surface:

1. **Success** — `await …​.result` resolves `{ ok: true, value }` with the returned value.
2. **Awaited failure is handled** — `const r = await x.exec().result` on a throwing activity resolves `{ ok: false, error }`; the run is green (exit 0) and a sibling daemon is untouched (reading `.result` observed it).
3. **`.result` never rejects** — the resolved-`{ok:false}` promise is asserted to resolve (not reject) even with no handler attached.
4. **`handleFailure` on a fire-and-forget failure** — handler runs with the error, `.result` (if read) is `{ ok: false, error }`, run green, sibling daemon untouched.
5. **`on("error")`** — observed → green; regression guard that it still suppresses teardown.
6. **Cancelled** — `.result` resolves `{ ok: false, error: CancelledError }` and a registered `handleFailure` handler did **not** run.
7. Existing regression guards stay: fire-and-forget crash with nothing attached → teardown (exit 1); `once("healthy")` then fail → teardown; saved-handle-awaited-later → teardown; failed assert → fault; a failed action cancels its own children.

## Non-goals

- No change to teardown mechanics, the grace timer, SIGINT handling, log/artifact formats, or the verdict/fault model.
- No `.handleFailure` recovery value (handler is `=> void`; inspect `.result` for the error).
- No change to `action`, `om`, `.emits`/`.ref` builders, `ctx`, or the action library beyond the `.done`→`.result` rename and the healthcheck gate reading `.result`.
- Windows `killTree` latency remains out of scope (tracked separately).
