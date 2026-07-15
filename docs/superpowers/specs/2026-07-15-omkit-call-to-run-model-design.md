# Omkit "Call to Run" Model — Design

**Goal:** Collapse the two-step `action(...)(args).exec()` into a single step: **calling an action launches it** and returns the live `Activity`. Delete `.exec()` and the `ActionInstance` layer. Simplify `command` to `command(cmd, options?)` (no name).

**Status:** approved 2026-07-15. Records the change; implementation follows inline.

---

## Motivation

Every launch in the real pipelines is `helper(args).exec()` (or `command(...)` then `.exec()`). The `.exec()` is pure ceremony — the instance is never usefully held inert. `withCache`/`tag` are the only things ever configured before launch, and both can attach to the live handle. Collapsing the call removes an entire concept (`ActionInstance`) and a mandatory method.

## The model

`action(name).emits<…>().ref<…>().run(body)` still returns a callable **`Action`**. **Invoking the Action launches it** under the ambient node and returns the live **`Activity`** (today's `RunHandle`, renamed to match the term already used in prior specs/README).

```js
// define once (unchanged)
const build = action("build").emits<…>().run(body)

// inside om() — the call IS the launch
await build(src, out).result
build(src, out).withCache(src).tag("x")
watchDocs().tag("daemon")                     // fire-and-forget daemon
const ready = await explorerReady().tag("gate").result
```

- `ActionInstance` and `AnyActionInstance` are deleted.
- `.exec()` is deleted outright — **no deprecated alias** (a lingering `.exec()` undercuts the simplification).
- Re-invoking an Action launches again (each call is one run) — same as calling any factory twice.

### `Activity` surface (was `RunHandle`)

Unchanged except `withCache` moves here from `ActionInstance`:

| member                                                  | notes                                                 |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `id`                                                    | assigned synchronously at the call                    |
| `result: Promise<Outcome<Result>>`                      | always resolves; reading observes                     |
| `ref: Promise<Handle>`                                  | rejects on failure/cancel                             |
| `tag(name): this`                                       | valid anytime (buffered pre-body, or live)            |
| `withCache(...paths): Activity<Result \| undefined, …>` | **pre-body only** — see timing                        |
| `handleFailure(fn): this`                               | side-effect-only; observes                            |
| `on` / `once`                                           | observe events; `on("error")`/`once("error")` observe |
| `cancel()`                                              | abort this node + subtree                             |

## Launch timing — synchronous node, microtask body

`withCache` must gate **before** the body runs, yet it chains **after** the call. So the call splits into two phases:

1. **Synchronously** (in `ExecutionTree.launch`): create the node — `id`, registry + parent linkage, launch-pointer log, tags — and register its tracked promise for teardown/`drive()`. Then `node.arm(body, args)` and `queueMicrotask(() => node.commit())`.
2. **On the microtask** (`node.commit()`): run the body inside `currentNode.run(node, …)`.

Config methods mutate the armed node until `commit()` fires — which happens when the surrounding synchronous code unwinds (the next `await`, or the om body returning to the loop).

**The one rule:** all pre-body config (`withCache`) must be chained **before the first `await` after the call**. `withCache` after commit **throws** `withCache: already launched` — loud, never silent. `tag`, `handleFailure`, `on`, `once` remain valid anytime.

**Fire-and-forget still works:** `watchDocs()` schedules `commit` unconditionally, so a daemon that is never awaited still starts, and an unobserved failure still tears the run down (the microtask deferral does not change the observed-vs-unobserved check — the whole synchronous config chain has run before any body can fail).

### Why deferral is safe

- **Tree shape & ordering** are established synchronously in call order (node creation, launch pointers, `drive()` registration) — unchanged from today.
- **`drive()`** waits on the tracked promise, which resolves when the deferred body settles; daemons keep the run alive exactly as before (the run stays up on unsettled daemons until SIGINT tears down).
- **Observed-failure timing improves:** a synchronously-throwing body can no longer fail _before_ `handleFailure`/`on("error")` attach, because the body cannot run until the sync chain (and first await) completes. The existing late-delivery guards stay for cross-`await` attachment.

**Accepted edge:** if the run is torn down between the call and the commit microtask (e.g. the om body synchronously calls `cancel()` after launching), the deferred body starts with an already-aborted signal and settles `cancelled` — the same clean-stop path as any mid-flight cancel.

## `command(cmd, options?)` — an action, no name

`command` currently returns an `ActionInstance` (it ends its `action(name).run(…)` with a trailing `()`) and takes an explicit name. Two changes:

1. **Return the `Action`** — drop the trailing `()`. Call sites use `watchDocs()` to launch.
2. **Drop the `name` parameter** — derive the action name from the command itself:
   - shell form: name = the command string (e.g. `"npm run dev"`).
   - direct-exec form (`options.args`): name = `[file, ...args].join(" ")`.

Semantic labels remain available via `.tag(...)` (e.g. `command("npm run dev", { cwd }).tag("dev:daemon")`).

`CommandOptions` (`args`, `cwd`, `env`, `inheritDebugger`) and both execution forms are otherwise unchanged.

## `step`

`step(name, fn)` becomes `action(name).run(fn)().result.then(r => { if (!r.ok) throw r.error; return r.value })` — the trailing `()` now launches.

## Blast radius

- **Core:** `types.ts` (rename + delete instance types + move `withCache`), `action.ts` (delete `Instance`, `Action` call → `launch`), `ActionRun.ts` (implement `Activity`; `arm`/`commit`/`withCache`/`committed`), `ExecutionTree.ts` (deferred `launch`), `step.ts`, and comment-only touches in `om.ts` / `index.ts` / `context.ts`.
- **Cache gate:** the fingerprint-gate logic moves from `action.ts` into `ActionRun.withCache` (using `FolderCache`; ActionRun already imports from `system/`).
- **Helpers:** only `command.ts` changes (return Action, derive name). All other action definitions are untouched.
- **Call sites:** `wm/src/pipelines/tskb-dev.ts`, `tskb-build.ts` (drop `.exec()`, drop command names).
- **Tests:** `refactored-smoke`, `teardown`, `artifacts-folder`, `defined-at`, `cancellation-log` (drop `.exec()`); new coverage for deferred-launch, `withCache` on the handle, `withCache` after `await` throwing, and `command` name derivation.
- **Docs:** `packages/omkit/README.md` examples.

## Testing

- Existing suites pass with `.exec()` removed (behavior preserved).
- New: `build(a).withCache(x)` on the handle gates like today; `withCache` after an `await` throws; a fire-and-forget daemon started by a bare call still keeps the run alive and an unobserved failure still tears down; `command("npm run dev")` yields an action named `npm run dev`.
- `npm run build` (omkit + wm typecheck) clean; full vitest suite green.

## Out of scope

- No change to `Outcome`/`.result`/`handleFailure` semantics, teardown engine, logging, or the `om` root.
- No options-bag config form; modifiers stay fluent on the `Activity`.
