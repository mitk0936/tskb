# omkit — Cancellation & Teardown Redesign

**Date:** 2026-07-13
**Status:** Approved design, ready for implementation plan
**Scope:** `packages/omkit/src/core` (`ExecutionTree.ts`, `ActionRun.ts`) and the SIGINT/finalize wiring. Actions are unchanged.

## Problem

The current teardown machinery is over-built. It has a three-level Ctrl+C escalation, a `forcedWake` deferred, a `forced` flag, a SIGINT counter, a grace timer, and a `process.exit()` inside `finalize()`. Worse, it has two behavioral gaps:

1. **Background failures are silently swallowed.** `trackNode` does `void node.done.catch(() => {})`, so an action that fails while nobody awaits it (a daemon crash, a fire-and-forget action) is recorded but never tears the run down. The run can hang forever on a dead dependency.
2. **The log can be truncated.** `finalize()` removes the SIGINT handler _before_ it writes the log files, so a Ctrl+C during the writes falls through to Node's hard-kill and you lose the log.

## Goals

- An action failure **throws and tears everything down** — unless the caller is handling it.
- **Ctrl+C** tears everything down.
- **`ctx.cancel()`** tears everything down.
- Teardown is **always graceful**: the run log is written on every exit path, no matter what.
- Delete the accumulated complexity: escalation, `forcedWake`, `forced`, the SIGINT counter, and `process.exit()`.

## Non-goals

- No change to the action API surface (`om`, `action`, `step`, `.exec()`, `.done`, `.ref`, `.once`, `.on`).
- No change to log formatting, writers, or on-disk artifact shapes.
- The Windows synchronous `killTree` latency is a known separate issue and is out of scope here.

## The model — three triggers, one path

Everything funnels into a single idempotent `teardown(reason)`:

1. **Unhandled action failure → teardown.** A node that fails while it is **not observed** (see below) calls `teardown`.
2. **Ctrl+C → teardown.** One handler, one signal, no escalation.
3. **`ctx.cancel()` → teardown.** Identical.

An **observed** failure does not directly teardown — its error is delivered to whoever is handling it, and normal JavaScript takes over. If that `await` is inside a `try/catch`, it is handled and the run continues. If it is uncaught, it rejects the `om` body, which fails the root, which triggers `teardown("body error")`. So "throws and tears down unless try/catched" is just ordinary exception propagation for awaited actions, plus an explicit rule for fire-and-forget ones.

### The "observed" rule

A node is **observed** if something is positioned to receive its **error**:

- its `.done` getter was accessed (an `await …​.done`, or `step(...)` internally), **or**
- its `.ref` getter was accessed (a downstream action awaiting the handle), **or**
- an `on("error")` / `once("error")` handler was attached.

Event-only listeners do **not** count as observing, because they never deliver the error:

- `once("healthy")`, `once("done")`, `on("done")` — these resolve with a payload or `undefined`; they can't surface a failure. A node awaited _only_ this way is treated as unobserved, so if it fails it tears the run down instead of silently letting the body proceed on a bad state.

**Timing:** the check runs one microtask after `fail()`. For a normally-awaited action the `.done`/`.ref` getter is touched in the same tick it launches — well before it can fail — so `observed` is already `true`. For a saved-then-awaited-later handle, the getter is touched _after_ the failure, so at fail-time `observed` is `false` and the run tears down immediately. This is the intended behavior:

```js
const h = foo().exec(); // launch, .done not yet touched
await doOtherStuff(); // foo fails HERE -> unobserved -> teardown
try {
  await h.done;
} catch {
  // never reached
}
```

**Rule of thumb for users:** to swallow a background action's failure without tearing the run down, you must already be awaiting its `.done` (or have an `on("error")` handler) at the moment it fails.

## Teardown mechanics

```
teardown(reason):                       // idempotent; first call wins
  if phase != "open": return
  phase = "closing"
  narrate("tearing down · " + reason)
  root.cancel()                         // abort cascade: procs killed, daemons unblocked
  graceTimer = setTimeout(finalize, GRACE_MS)   // single 5s safety net (unref not needed)

drive():                                // after the root body settles
  await allSettled(all node run-promises)   // resolves when nodes drain...
  finalize()                            // ...or the graceTimer got there first

finalize():                             // runs exactly once (guard on phase)
  phase = "closed"
  clearTimeout(graceTimer)
  narrate("finished")
  store.close()
  await rawStream ; await liveRenderer  // flush the streamed outputs
  writeNodeLogs ; writeRollup×3 ; writeResult   // <-- log is written HERE
  remove SIGINT / uncaughtException / unhandledRejection handlers   // <-- AFTER writes
  console.uninstall()
  ExecutionTree.current = null
  printSummary()
  process.exitCode = verdictOk ? (current) : 1
  // no process.exit(): the loop drains on its own once child procs are dead
```

`GRACE_MS` (5000) is the entire safety net. If a misbehaving action ignores its abort signal, `drive()` would wait forever — the grace timer forces `finalize()` anyway so the log is always written; stragglers are recorded with whatever status they currently hold (`running`/`cancelled`).

### Ctrl+C handling

- One handler: `onSigint = () => teardown("interrupted (SIGINT)")`.
- The handler stays installed (`process.on`, not `once`) through teardown **and** through all of `finalize()`'s writes, and is removed only after the log is on disk. This is what guarantees a log survives mashing: every extra press re-enters `teardown`, which is a no-op once `phase != "open"`, and can never fall through to Node's kill-without-log default.
- Extra presses are **ignored** — teardown always takes its normal ≤5s course.

## Failure classification & the verdict

`ActionRun.fail(error)` classifies the node's own status:

- **Signal aborted** ⇒ the node is `cancelled` (a clean stop). Rejects `.done`/`.ref` with `CancelledError`.
- **Not aborted** ⇒ the node is `failed`: log the error, reject `.done`/`.ref` with it.

Crucially, `fail()` **no longer records a verdict failure directly.** A `failed` status is just the node's own record — whether it dirties the run's verdict depends on whether the failure was _handled_:

- **Unobserved failure** (the one-microtask observed-check finds no one holding the error): call the tree's teardown hook with `("<path> failed")` **and** record the fault. This is red.
- **Observed failure**: do nothing further. The rejection is delivered to the awaiter, who decides:
  - **caught** (`try/catch`) ⇒ handled ⇒ **no fault, green.**
  - **uncaught** ⇒ propagates ⇒ the `om` body throws ⇒ the root node fails ⇒ `teardown("body error")` records the root as the fault. Red.

So "caught ⇒ green" and "unhandled ⇒ red/teardown" both fall out of one rule: **the verdict is red iff a fault was recorded**, and faults are recorded in exactly four places — an unobserved failure's teardown, the root-body error, a process `uncaughtException`/`unhandledRejection`, and a failed `assert` (outside teardown). `verdictOk()` therefore checks only the collected fault list; it **no longer scans the registry for any `status === "failed"`** (that scan is what would wrongly redden a caught failure).

The node internally swallows its **own** `settled`/`handle` rejection (via the stored deferred reference, _not_ the public getter, so this internal catch does not mark the node observed) — that replaces `trackNode`'s blanket `.catch()`.

### A failure aborts its own subtree

Independently of the run-wide verdict, **a node that fails aborts its own subtree**: its children receive `CancelledError` (a clean stop, not faults) and its spawned procs are killed. A failed action's work is over, so its descendants go down with it — even when the failure is _caught_ and the run continues. This is local cleanup, distinct from `teardown()`; it aborts only this node's controller, cascading to descendants, and never touches siblings or ancestors.

Deliberate asymmetry: **success does not** abort children. A body that returns while a daemon it launched keeps running is the intended keep-alive model (the run stays alive on that daemon until Ctrl+C / `cancel()`). Only failure tears the subtree down.

**Implementation note — distinguishing self-abort from ancestor-abort.** `fail()`'s unobserved-check must not mistake this failure's own subtree-abort for "the run is already tearing down." So the node tracks a `cascadeCancelled` flag set _only_ by the parent-signal abort listener (an ancestor cancelling this node). The one-microtask check is then `!observed && !cascadeCancelled` — the node's own `controller.abort()` from failing does not set that flag, so an unobserved failure still triggers `onUnhandledFailure`, while a node caught in an ancestor's teardown does not double-report.

## What gets deleted

From `ExecutionTree.ts`:

- `force()`, `forced`, `forcedWake`
- `sigints`, the 1st/2nd/3rd `handleSigint` escalation branches
- `process.exit()` in `finalize()`
- `trackNode`'s `void node.done.catch(() => {})` swallow (replaced by the node's internal catch)
- `verdictOk()`'s `registry.some((n) => n.status === "failed")` scan (verdict is now the fault list only)
- `TEARDOWN_GRACE_MS` stays but is the _only_ timer; `beginTeardown` is renamed `teardown`. It is overridable per-run for tests (a static `ExecutionTree.graceMs`, default 5000) so the force-finalize path can be exercised with a short real timer instead of fake timers.

From `ActionRun.ts`:

- Add: `observed` flag, set by the `.done`/`.ref` getters and `on/once("error")`.
- Add: `onUnhandledFailure` hook in `NodeInit`, wired by the tree to `teardown`.
- Add: internal self-catch on `settled`/`handle` so an unobserved failure doesn't surface as a Node `unhandledRejection`.

## What stays (it's correct)

- The abort-tree cascade: each node's `AbortController` chains off its parent; `teardown` aborts only the root and it fans out.
- "A killed action is `cancelled`, not `failed`" so shutdown noise doesn't pollute the verdict.
- `finalize()` always writing per-node logs, the three rollups, and `result.json`.
- The `uncaughtException` / `unhandledRejection` process-level handlers as backstops → `teardown`.

## Edge cases

| Case                                                 | Behavior                                                                                                                                                  |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mash Ctrl+C                                          | 1st press tears down; the rest are no-ops. Log always written (≤5s).                                                                                      |
| Fire-and-forget action fails                         | Unobserved → teardown.                                                                                                                                    |
| Daemon crashes (never `await .done`)                 | Unobserved → teardown.                                                                                                                                    |
| `await foo().done` uncaught                          | Rejects → body throws → root fault → teardown. Verdict **red**.                                                                                           |
| `try { await foo().done } catch {}`                  | Observed + caught → handled, no run teardown, **no fault**. Verdict **green**. But `foo`'s own children are cancelled + its procs killed (subtree abort). |
| A fails with fire-and-forget children                | `A`'s children get `CancelledError`, `A`'s procs killed — whether or not the run tears down.                                                              |
| Saved handle, awaited later, fails before the await  | Unobserved at fail-time → teardown + fault. Red.                                                                                                          |
| Healthcheck awaited via `once("healthy")` then fails | `once` doesn't observe the error → teardown + fault. Red.                                                                                                 |
| `ctx.cancel()` / Ctrl+C with no other fault          | Clean teardown, no fault. Verdict **green**, exit 0.                                                                                                      |
| Action ignores its abort signal                      | Grace timer forces finalize at `graceMs`; log written; straggler recorded as-is.                                                                          |

## Testing

Unit tests (colocated per package convention) covering:

1. Fire-and-forget failure tears down a sibling daemon and the fault is in `result.json` (verdict red, exit 1).
2. `try/catch` around `await .done` swallows the failure; run completes with **no fault** (verdict green, exit 0) and a sibling daemon is _not_ torn down.
3. Uncaught `await .done` tears down (body-error fault, exit 1).
4. Saved-handle-awaited-later failure tears down immediately (fault recorded).
5. `ctx.cancel()` tears down, writes the log, verdict green (exit 0).
6. Simulated SIGINT (`process.emit("SIGINT")`) tears down once; a second emit is a no-op (one `tearing down` line); log written.
7. A daemon that ignores its signal is force-finalized after a short `ExecutionTree.graceMs` and the log still lands.
8. A failed `assert` remains a fault (verdict red) — regression guard for the existing behavior.
9. A failed action's fire-and-forget child is cancelled (and its procs killed) even when the failure is caught and the run continues.

```

```
