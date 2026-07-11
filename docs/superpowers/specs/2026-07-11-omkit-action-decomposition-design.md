# omkit — Action model decomposition

**Date:** 2026-07-11
**Scope:** Behavior-preserving refactor of `packages/omkit/src/orchestration/action/action.ts`.
**Status:** Approved design.

## Problem

`action.ts` (~336 lines) concentrates every action concern into one file, and the
`ActionRun` class (~230 lines) alone juggles at least six unrelated
responsibilities: a `Deferred` primitive, a ref→instance registry, the event/
lifecycle surface (`on`/`once`/`awaitEvent`/`systemEmit`/`logEmit`), outcome
settlement (`start`'s success/error routing, `exitCodeOf`), context assembly, and
the folder-cache wrapper. The tangle makes the class hard to read and hard to
change — you cannot understand any one concern without scanning the whole class.

## Goal & non-goals

**Goal:** Carve the tangled responsibilities into focused, single-purpose units so
each is independently readable, **without changing public API or runtime
behavior**.

**Non-goals:**

- No re-modelling of the abstractions (chosen: focused function extraction, not a
  Settlement/EventHub object split).
- No new characterization tests. The existing `spin-*` integration tests are the
  safety net and must stay green throughout.
- No unrelated refactoring, no naming churn on the public surface.

## Approach

**A — Focused function files.** `ActionRun` remains the conductor; mostly-pure and
independent pieces move into small single-purpose files it composes. All
extractions are dependency-light and introduce no circular imports.

### Target file layout

| New file                              | Exports                                      | Moved from                                                  |
| ------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| `utils/Deferred.ts`                   | `Deferred<T>` interface + `defer<T>()`       | `ActionRun.defer` static + the `Deferred` interface         |
| `orchestration/action/refRegistry.ts` | `producerOfRef`, `registerRef(instance)`     | `refOwners` `WeakMap` + `producerOfRef` + ctor registration |
| `orchestration/action/awaitEvent.ts`  | `awaitEvent(emitter, key)`                   | `ActionRun.awaitEvent` static                               |
| `orchestration/action/outcome.ts`     | `exitCodeOf(error)`, `failureOutcome(error)` | `ActionRun.exitCodeOf` static + the error branch of `start` |
| `orchestration/action/logEmit.ts`     | `logEmit(system, name, key, payload)`        | `ActionRun.logEmit` static                                  |
| `orchestration/action/context.ts`     | `buildContext(system, emit, attach)`         | the `ctx` object literal in `start`                         |
| `orchestration/action/withCache.ts`   | `cachedRun(inner, name, targets, ctx)`       | the inner exec body of `withCache`                          |

**`action.ts` keeps:** the `Exec` internal type, the (now thin) `ActionRun` class,
the `Builder` class, and the `action()` entry point.

### `ActionRun` after the refactor

A conductor that composes the helpers instead of inlining them:

- **ctor:** `defer()` ×2 (from `utils/Deferred.ts`), `registerRef(this)`, and the
  `void this.handle.promise.catch(() => {})` unhandled-rejection guard — unchanged.
- **`start`:** wire `emitter.onAny(... => logEmit(system, name, key, payload))`; run
  `exec(buildContext(system, emit, attach), ...args)`; on success settle the
  Outcome, `systemEmit("done")`, resolve the handle; on failure
  `settled.resolve(failureOutcome(error))`, `systemEmit("error")`, `systemEmit("done")`,
  reject the handle. **Same ordering as today.**
- **`once("done")`** still reads `settled.promise` directly (fast-path); other keys
  go through imported `awaitEvent`. `on`, `attach`, `systemEmit` stay as thin methods.
- **`withCache`** stays a ~3-line method:
  `const targets = FolderCache.resolvePaths(paths); const { name } = this; return action(name).run((ctx) => cachedRun(this, name, targets, ctx))();`
  `resolvePaths` stays eager at the call site (fails fast on a relative path). Because
  `action()` lives in `action.ts`, `withCache.ts` imports only `FolderCache` + types —
  **no dependency on the builder**, so no import cycle.

### Unit contracts

- **`defer<T>()`** → `{ promise, resolve, reject }`; identical to the current static.
- **`refRegistry`** — module-private `WeakMap`. `registerRef(instance)` records
  `instance.ref → instance`; `producerOfRef(value)` returns the owner or `undefined`.
- **`awaitEvent(emitter, key)`** — never-rejects promise resolving with the payload,
  or `undefined` if `done` fires first; retained-snapshot synchronous-fire handling
  preserved verbatim. Not used for `key === "done"`.
- **`exitCodeOf(error)`** — duck-types a numeric `exitCode` off a thrown error.
- **`failureOutcome(error)`** → `{ ok: false, error }` or `{ ok: false, error, exitCode }`
  when `exitCodeOf` yields a number. Encapsulates the branch currently inline in `start`.
- **`logEmit(system, name, key, payload)`** — the sole place emits become log lines;
  `·`-delimited fields, string payload inline, richer payload snapshotted and linked
  (`→ <rel>`). Formatting preserved byte-for-byte.
- **`buildContext(system, emit, attach)`** → `ActionContext`: spreads `system`, then
  adds `emit`, `attach`, `proc: createProc(system.logs, system.signal, system.output.snapshots)`,
  `artifactsFolder: system.output.folder.artifacts()`,
  `snapshot: (name, value) => system.output.snapshots.snapshot(name, value)`. Identical shape.
- **`cachedRun(inner, name, targets, ctx)`** — fingerprint `targets`; on cache hit
  append the `cached, skipping` info line and return `undefined`; else
  `inner.start({ logs, signal, nod, output, assert })`, re-throw on failure, else
  `FolderCache.write(targets, fp)` and return `outcome.value`. Same as today's inner body.

## Behavior-preservation guarantees

- Public API untouched: `index.ts` exports, and the `Action` / `ActionInstance` /
  `ActionBuilder` / `Outcome` types are unchanged.
- Exactly one internal import updated: `SpinHost.ts` imports `producerOfRef` from
  `refRegistry.ts` instead of `action.ts`.
- Preserved verbatim: settle ordering, the `void handle.promise.catch()` guard, the
  `once("done")` fast-path, eager `resolvePaths` in `withCache`, and `logEmit`'s
  field/snapshot formatting.
- Net effect: `ActionRun` drops from ~230 → ~120 lines; each concern independently
  readable and independently importable.

## Verification

- `npx tsc --noEmit` in `packages/omkit` — clean.
- `npx vitest run packages/omkit` from repo root — all existing tests
  (`spin-*`, `assert`, `console-capture`, `log-renderer-assert`) stay green.
