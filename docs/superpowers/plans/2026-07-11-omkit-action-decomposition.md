# omkit Action Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carve the tangled `ActionRun` class in `packages/omkit/src/orchestration/action/action.ts` into focused single-purpose helper files, with identical public API and runtime behavior.

**Architecture:** Behavior-preserving extraction (spec Approach A). `ActionRun` stays the conductor; six mostly-pure concerns move into small files it composes. Every extraction is dependency-light with no circular imports. Each task ends by proving the change green via `tsc --noEmit` + the existing `spin-*` suite — the safety net (no new tests are added).

**Tech Stack:** TypeScript (NodeNext ESM, `.ts` import specifiers), Vitest.

## Global Constraints

- **No behavior or API change.** `index.ts` exports and the `Action` / `ActionInstance` / `ActionBuilder` / `Outcome` types stay identical.
- **Import specifiers use explicit `.ts` extensions** (match existing files).
- **No git commits** — per project preference, work directly in the tree; do not commit or branch. Each task's "checkpoint" is a green typecheck + test run, not a commit.
- **Typecheck:** run from `packages/omkit`: `npx tsc --noEmit` → must print nothing (exit 0).
- **Tests:** run from repo root `d:\tskb`: `npx vitest run packages/omkit` → all 5 files / 21 tests pass.
- Preserve verbatim: settle ordering in `start`, the `void this.handle.promise.catch(() => {})` guard, the `once("done")` fast-path, eager `resolvePaths` in `withCache`, and `logEmit`'s field/snapshot formatting.

---

### Task 1: Extract the `Deferred` primitive

**Files:**

- Create: `packages/omkit/src/utils/Deferred.ts`
- Modify: `packages/omkit/src/orchestration/action/action.ts`

**Interfaces:**

- Produces: `interface Deferred<T> { promise: Promise<T>; resolve: (value: T) => void; reject: (reason: unknown) => void }` and `function defer<T>(): Deferred<T>`.
- Consumes: nothing.

- [ ] **Step 1: Create `utils/Deferred.ts`**

```ts
/** A promise paired with its settlers, for a set-once value (a handle, an Outcome, …). */
export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/** Create a {@link Deferred}: a fresh promise with its `resolve`/`reject` captured. */
export function defer<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
```

- [ ] **Step 2: Add the import to `action.ts`** (below the `FolderCache` import)

```ts
import { defer, type Deferred } from "../../utils/Deferred.ts";
```

- [ ] **Step 3: Delete the local `Deferred` interface from `action.ts`**

Remove this block (lines ~17-22):

```ts
/** A promise paired with its settlers, for a set-once value (the handle / the Outcome). */
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}
```

- [ ] **Step 4: Delete the `defer` static and switch the call sites**

Remove the static:

```ts
  private static defer<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }
```

In the constructor, replace:

```ts
this.handle = ActionRun.defer<Handle>();
this.settled = ActionRun.defer<Outcome<Result>>();
```

with:

```ts
this.handle = defer<Handle>();
this.settled = defer<Outcome<Result>>();
```

- [ ] **Step 5: Typecheck**

Run (from `packages/omkit`): `npx tsc --noEmit`
Expected: no output, exit 0.

- [ ] **Step 6: Tests**

Run (from repo root): `npx vitest run packages/omkit`
Expected: `Test Files 5 passed (5)`, `Tests 21 passed (21)`.

---

### Task 2: Extract the ref registry

**Files:**

- Create: `packages/omkit/src/orchestration/action/refRegistry.ts`
- Modify: `packages/omkit/src/orchestration/action/action.ts`
- Modify: `packages/omkit/src/orchestration/spin/SpinHost.ts`

**Interfaces:**

- Produces: `function registerRef(instance: AnyActionInstance): void` and `const producerOfRef: (value: unknown) => AnyActionInstance | undefined`.
- Consumes: `AnyActionInstance` from `./types.ts`.

- [ ] **Step 1: Create `orchestration/action/refRegistry.ts`**

```ts
import type { AnyActionInstance } from "./types.ts";

// Maps an instance's `.ref` promise back to the instance that produces it, so the
// run can catch a consumer launched before (or without) its `.ref` producer —
// which would otherwise await a handle that never arrives and hang silently.
const refOwners = new WeakMap<object, AnyActionInstance>();

/** Record `instance` as the producer of its own `.ref` handle promise. */
export function registerRef(instance: AnyActionInstance): void {
  refOwners.set(instance.ref, instance);
}

/**
 * If `value` is some action instance's `.ref` promise, the instance that owns it
 * (the producer of that handle); otherwise `undefined`. Used by the run to verify
 * a `.ref` dependency was launched before the action that consumes it.
 */
export const producerOfRef = (value: unknown): AnyActionInstance | undefined =>
  typeof value === "object" && value !== null ? refOwners.get(value) : undefined;
```

- [ ] **Step 2: Remove the moved code from `action.ts`**

Delete this block (near the top, after the imports):

```ts
// Maps an instance's `.ref` promise back to the instance that produces it, so the
// run can catch a consumer launched before (or without) its `.ref` producer —
// which would otherwise await a handle that never arrives and hang silently.
const refOwners = new WeakMap<object, AnyActionInstance>();

/**
 * If `value` is some action instance's `.ref` promise, the instance that owns it
 * (the producer of that handle); otherwise `undefined`. Used by the run to verify
 * a `.ref` dependency was launched before the action that consumes it.
 */
export const producerOfRef = (value: unknown): AnyActionInstance | undefined =>
  typeof value === "object" && value !== null ? refOwners.get(value) : undefined;
```

- [ ] **Step 3: Add the import and update the constructor in `action.ts`**

Add import:

```ts
import { registerRef } from "./refRegistry.ts";
```

In the constructor, replace:

```ts
// Register this instance as the producer of its `.ref`, so the run can catch a
// consumer built with this `.ref` that gets launched before this instance.
refOwners.set(this.ref, this as AnyActionInstance);
```

with:

```ts
// Register this instance as the producer of its `.ref`, so the run can catch a
// consumer built with this `.ref` that gets launched before this instance.
registerRef(this as AnyActionInstance);
```

- [ ] **Step 4: Repoint the `SpinHost.ts` import**

In `packages/omkit/src/orchestration/spin/SpinHost.ts` replace:

```ts
import { producerOfRef } from "../action/action.ts";
```

with:

```ts
import { producerOfRef } from "../action/refRegistry.ts";
```

- [ ] **Step 5: Typecheck** — `npx tsc --noEmit` (from `packages/omkit`) → no output.

- [ ] **Step 6: Tests** — `npx vitest run packages/omkit` (from repo root) → 21 passed.

---

### Task 3: Extract `awaitEvent`

**Files:**

- Create: `packages/omkit/src/orchestration/action/awaitEvent.ts`
- Modify: `packages/omkit/src/orchestration/action/action.ts`

**Interfaces:**

- Produces: `function awaitEvent<E extends object, K extends keyof E>(emitter: Emitter<E>, key: K): Promise<E[K] | undefined>`.
- Consumes: `Emitter` from `../events/events.ts`.

- [ ] **Step 1: Create `orchestration/action/awaitEvent.ts`**

```ts
import type { Emitter } from "../events/events.ts";

/**
 * A promise for the next emit of `key`. It **never rejects**: it resolves with
 * the event's payload, or with `undefined` if the action settles (`done` — which
 * always fires) before `key` ever does. A retained snapshot resolves it
 * immediately. (Not used for `key === "done"`, which reads the settled Outcome.)
 */
export function awaitEvent<E extends object, K extends keyof E>(
  emitter: Emitter<E>,
  key: K
): Promise<E[K] | undefined> {
  return new Promise<E[K] | undefined>((resolve) => {
    const offs: Array<() => void> = [];
    let settled = false;
    // First of [the event | done] to fire wins; the rest are unsubscribed.
    const settle = (act: () => void): void => {
      if (settled) return;
      settled = true;
      for (const off of offs) off();
      act();
    };
    // listenOnce is keyed by E; the system `done` key is always present on an
    // instance's event map, so reach it through a loosened view.
    const listen = emitter.listenOnce as (
      k: PropertyKey,
      h: (payload: unknown) => void
    ) => () => void;

    offs.push(listen(key, (payload) => settle(() => resolve(payload as E[K]))));
    // `done` fires once on any settle (success or failure); if it beats `key`,
    // the event will never come — resolve `undefined` rather than reject.
    if ((key as PropertyKey) !== "done") {
      offs.push(listen("done", () => settle(() => resolve(undefined))));
    }
    // A retained snapshot fires a listen synchronously during registration; if
    // that already settled us, drop any listeners registered afterwards.
    if (settled) for (const off of offs) off();
  });
}
```

- [ ] **Step 2: Delete the `awaitEvent` static from `action.ts`**

Remove the entire `private static awaitEvent<E extends object, K extends keyof E>(…) { … }` block (including its doc comment).

- [ ] **Step 3: Add the import and update `once()` in `action.ts`**

Add import:

```ts
import { awaitEvent } from "./awaitEvent.ts";
```

In `once`, replace:

```ts
key === "done" ? this.settled.promise : ActionRun.awaitEvent(this.emitter, key);
```

with:

```ts
key === "done" ? this.settled.promise : awaitEvent(this.emitter, key);
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → no output.

- [ ] **Step 5: Tests** — `npx vitest run packages/omkit` → 21 passed.

---

### Task 4: Extract outcome helpers

**Files:**

- Create: `packages/omkit/src/orchestration/action/outcome.ts`
- Modify: `packages/omkit/src/orchestration/action/action.ts`

**Interfaces:**

- Produces: `function exitCodeOf(error: unknown): number | undefined` and `function failureOutcome(error: unknown): Outcome<never>`.
- Consumes: `Outcome` from `./types.ts`.

- [ ] **Step 1: Create `orchestration/action/outcome.ts`**

```ts
import type { Outcome } from "./types.ts";

/** Duck-type an exit code off a thrown error (zx's ProcessOutput, command's exit error). */
export function exitCodeOf(error: unknown): number | undefined {
  const code = (error as { exitCode?: unknown } | null | undefined)?.exitCode;
  return typeof code === "number" ? code : undefined;
}

/**
 * Build the failure {@link Outcome} for a thrown error: `{ ok: false, error }`,
 * carrying `exitCode` when the error is a process failure (see {@link exitCodeOf}).
 * Assignable to `Outcome<Result>` for any `Result` — the failure branch is
 * result-independent.
 */
export function failureOutcome(error: unknown): Outcome<never> {
  const exitCode = exitCodeOf(error);
  return exitCode === undefined ? { ok: false, error } : { ok: false, error, exitCode };
}
```

- [ ] **Step 2: Delete the `exitCodeOf` static from `action.ts`**

Remove:

```ts
  /** Duck-type an exit code off a thrown error (zx's ProcessOutput, command's exit error). */
  private static exitCodeOf(error: unknown): number | undefined {
    const code = (error as { exitCode?: unknown } | null | undefined)?.exitCode;
    return typeof code === "number" ? code : undefined;
  }
```

- [ ] **Step 3: Add the import and simplify the error branch in `start()`**

Add import:

```ts
import { failureOutcome } from "./outcome.ts";
```

In `start`'s rejection handler, replace:

```ts
        (error: unknown): Outcome<Result> => {
          const exitCode = ActionRun.exitCodeOf(error);
          const outcome: Outcome<Result> =
            exitCode === undefined ? { ok: false, error } : { ok: false, error, exitCode };
          // Emit `error` (for `.on("error")` handlers), then settle `done` with the
          // Outcome — the canonical failure signal that `.done`/`once` read.
          this.systemEmit("error", error);
```

with:

```ts
        (error: unknown): Outcome<Result> => {
          const outcome = failureOutcome(error);
          // Emit `error` (for `.on("error")` handlers), then settle `done` with the
          // Outcome — the canonical failure signal that `.done`/`once` read.
          this.systemEmit("error", error);
```

(The remaining lines of the handler — `this.settled.resolve(outcome)`, the `done` emit, `this.handle.reject(error)`, `return outcome` — stay unchanged.)

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → no output.

- [ ] **Step 5: Tests** — `npx vitest run packages/omkit` → 21 passed.

---

### Task 5: Extract `logEmit`

**Files:**

- Create: `packages/omkit/src/orchestration/action/logEmit.ts`
- Modify: `packages/omkit/src/orchestration/action/action.ts`

**Interfaces:**

- Produces: `function logEmit(system: SystemGlobal, name: string, key: string, payload: unknown): void`.
- Consumes: `SystemGlobal` from `./types.ts`.

- [ ] **Step 1: Create `orchestration/action/logEmit.ts`**

```ts
import type { SystemGlobal } from "./types.ts";

/**
 * Log one emit onto the run timeline, through the action's scoped `logs` so the
 * line carries its path. Fields are `·`-delimited — action name · key · payload.
 * A string payload rides inline; a richer one is written to a snapshot file and
 * linked (`→ <rel>`) so the durable record keeps it without bloating the line.
 * This is the sole place emits become log lines — the bus itself does no logging.
 */
export function logEmit(system: SystemGlobal, name: string, key: string, payload: unknown): void {
  const fields = [name, key];
  if (typeof payload === "string") {
    fields.push(payload);
  } else if (payload !== undefined) {
    fields.push(`→ ${system.output.snapshots.captureJson(`event-${name}-${key}`, payload).rel}`);
  }
  system.logs.append({ source: "event", level: "event", message: fields.join(" · ") });
}
```

- [ ] **Step 2: Delete the `logEmit` static from `action.ts`**

Remove the entire `private static logEmit(system: SystemGlobal, name: string, key: string, payload: unknown): void { … }` block (including its doc comment).

- [ ] **Step 3: Add the import and update the `onAny` wiring in `start()`**

Add import:

```ts
import { logEmit } from "./logEmit.ts";
```

Replace:

```ts
this.emitter.onAny((key, payload) => ActionRun.logEmit(system, this.name, String(key), payload));
```

with:

```ts
this.emitter.onAny((key, payload) => logEmit(system, this.name, String(key), payload));
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → no output.

- [ ] **Step 5: Tests** — `npx vitest run packages/omkit` → 21 passed.

---

### Task 6: Extract context assembly

**Files:**

- Create: `packages/omkit/src/orchestration/action/context.ts`
- Modify: `packages/omkit/src/orchestration/action/action.ts`

**Interfaces:**

- Produces: `function buildContext<Events extends object, Handle>(system: SystemGlobal, emit: Emitter<Events>["emit"], attach: (handle: Handle) => void): ActionContext<Events, Handle>`.
- Consumes: `createProc` from `../../system/process/process.ts`; `Emitter` from `../events/events.ts`; `ActionContext`, `SystemGlobal` from `./types.ts`.

- [ ] **Step 1: Create `orchestration/action/context.ts`**

```ts
import { createProc } from "../../system/process/process.ts";
import type { Emitter } from "../events/events.ts";
import type { ActionContext, SystemGlobal } from "./types.ts";

/**
 * Assemble the {@link ActionContext} handed to an action's `exec`: the injected
 * system services, plus this action's `emit`/`attach` and the per-action `proc`,
 * `artifactsFolder`, and `snapshot` convenience wired off `system.output`.
 */
export function buildContext<Events extends object, Handle>(
  system: SystemGlobal,
  emit: Emitter<Events>["emit"],
  attach: (handle: Handle) => void
): ActionContext<Events, Handle> {
  return {
    ...system,
    emit,
    attach,
    proc: createProc(system.logs, system.signal, system.output.snapshots),
    artifactsFolder: system.output.folder.artifacts(),
    snapshot: (name, value) => system.output.snapshots.snapshot(name, value),
  };
}
```

- [ ] **Step 2: Add the import and replace the inline `ctx` literal in `start()`**

Add import:

```ts
import { buildContext } from "./context.ts";
```

Replace:

```ts
      .then(() =>
        this.exec(
          {
            ...system,
            emit,
            attach: (value) => this.attach(value),
            proc: createProc(system.logs, system.signal, system.output.snapshots),
            artifactsFolder: system.output.folder.artifacts(),
            snapshot: (name, value) => system.output.snapshots.snapshot(name, value),
          },
          ...this.args
        )
      )
```

with:

```ts
      .then(() =>
        this.exec(buildContext(system, emit, (value) => this.attach(value)), ...this.args)
      )
```

- [ ] **Step 3: Remove the now-unused `createProc` import from `action.ts`**

Delete:

```ts
import { createProc } from "../../system/process/process.ts";
```

- [ ] **Step 4: Typecheck** — `npx tsc --noEmit` → no output. (If `createProc` is reported unused, confirm Step 3 was applied; if reported missing, it is still referenced somewhere unexpected — re-check Step 2.)

- [ ] **Step 5: Tests** — `npx vitest run packages/omkit` → 21 passed.

---

### Task 7: Extract the cache-gated run

**Files:**

- Create: `packages/omkit/src/orchestration/action/withCache.ts`
- Modify: `packages/omkit/src/orchestration/action/action.ts`

**Interfaces:**

- Produces: `function cachedRun<Result>(inner: { start(system: SystemGlobal): Promise<Outcome<Result>> }, name: string, targets: string[], ctx: SystemGlobal): Promise<Result | undefined>`.
- Consumes: `FolderCache` from `../../system/fs/FolderCache.ts`; `Outcome`, `SystemGlobal` from `./types.ts`. (`ctx` is typed `SystemGlobal` — `cachedRun` only reads `logs`/`signal`/`nod`/`output`/`assert`, so an `ActionContext` passes as-is and no event-map variance issue arises.)

- [ ] **Step 1: Create `orchestration/action/withCache.ts`**

```ts
import { FolderCache } from "../../system/fs/FolderCache.ts";
import type { Outcome, SystemGlobal } from "./types.ts";

/**
 * The cache-gated run behind {@link ActionInstance.withCache}. Fingerprints the
 * already-resolved `targets` (the action's *inputs*); on a hit, logs `cached,
 * skipping` and returns `undefined`; otherwise runs `inner` with the wrapper's
 * injected services, re-throwing its failure (so the wrapper fails too) and
 * recording the fingerprint only on success.
 */
export async function cachedRun<Result>(
  inner: { start(system: SystemGlobal): Promise<Outcome<Result>> },
  name: string,
  targets: string[],
  ctx: SystemGlobal
): Promise<Result | undefined> {
  const fp = await FolderCache.fingerprint(targets);
  if ((await FolderCache.read(targets)) === fp) {
    ctx.logs.append({ source: name, level: "info", message: "cached, skipping" });
    return undefined;
  }
  const outcome = await inner.start({
    logs: ctx.logs,
    signal: ctx.signal,
    nod: ctx.nod,
    output: ctx.output,
    assert: ctx.assert,
  });
  // Re-throw the inner failure so the wrapper fails too (the framework re-wraps it
  // into this wrapper's own Outcome); only record on success.
  if (!outcome.ok) throw outcome.error;
  await FolderCache.write(targets, fp);
  return outcome.value;
}
```

- [ ] **Step 2: Add the import and slim `withCache` in `action.ts`**

Add import:

```ts
import { cachedRun } from "./withCache.ts";
```

Replace the whole method:

```ts
  withCache(...paths: string[]): AnyActionInstance {
    // Validate + canonicalize eagerly here (at the call site), not lazily inside the
    // run — a relative path fails fast where it's written, and the resolved paths
    // give a stable cache key regardless of spelling.
    const targets = FolderCache.resolvePaths(paths);
    const { name } = this;
    // Wrap this instance in a fresh one (reusing the engine for its own
    // emitter/ref/on/once) that fingerprints `paths` and either skips or
    // runs+records. The wrapper keeps this action's `name`, so log lines and the
    // `launch <name>` line are unchanged; it forwards its injected logs/signal
    // straight into this inner instance's `start`.
    return action(name).run(async (ctx): Promise<Result | undefined> => {
      const fp = await FolderCache.fingerprint(targets);
      if ((await FolderCache.read(targets)) === fp) {
        ctx.logs.append({ source: name, level: "info", message: "cached, skipping" });
        return undefined;
      }
      const outcome = await this.start({
        logs: ctx.logs,
        signal: ctx.signal,
        nod: ctx.nod,
        output: ctx.output,
        assert: ctx.assert,
      });
      // Re-throw the inner failure so the wrapper fails too (the framework re-wraps
      // it into this wrapper's own Outcome); only record on success.
      if (!outcome.ok) throw outcome.error;
      await FolderCache.write(targets, fp);
      return outcome.value;
    })();
  }
```

with:

```ts
  withCache(...paths: string[]): AnyActionInstance {
    // Validate + canonicalize eagerly here (at the call site), not lazily inside the
    // run — a relative path fails fast where it's written, and the resolved paths
    // give a stable cache key regardless of spelling.
    const targets = FolderCache.resolvePaths(paths);
    const { name } = this;
    // Wrap this instance in a fresh one that keeps this action's `name` (so log lines
    // and the `launch <name>` line are unchanged) and delegates to `cachedRun`, which
    // fingerprints `targets` and either skips or runs+records this inner instance.
    return action(name).run((ctx) => cachedRun(this, name, targets, ctx))();
  }
```

- [ ] **Step 3: Typecheck** — `npx tsc --noEmit` → no output. (`FolderCache` must remain imported in `action.ts` — `resolvePaths` still runs here.)

- [ ] **Step 4: Tests** — `npx vitest run packages/omkit` → 21 passed.

- [ ] **Step 5: Final whole-tree verification**

Run (from repo root): `npx vitest run` and `npx tsc --noEmit` in `packages/omkit`.
Expected: omkit suite green; no type errors. Confirm `ActionRun` in `action.ts` now delegates to `defer`, `registerRef`, `awaitEvent`, `failureOutcome`, `logEmit`, `buildContext`, and `cachedRun`, and that `action.ts` no longer imports `createProc`.

---

## Notes for the implementer

- Apply tasks **in order** — each keeps the tree compiling and green, so a failure is localized to the task you just did.
- These are pure moves: if a typecheck error mentions a symbol you didn't touch, you likely deleted a still-referenced block or missed a call-site rename. Re-read the task's replace pairs.
- Do not add tests, do not reformat untouched code, do not commit.
