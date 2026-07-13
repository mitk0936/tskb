# omkit — ExecutionTree redesign (core)

**Date:** 2026-07-11
**Scope:** A fresh implementation of the omkit **core** under
`packages/omkit/src/__refactored/`, replacing the current run/log/output model.
**Status:** Design — awaiting spec review.

## Problem

The current core works but the density has migrated into `SpinHost` (~390 lines
doing lifecycle state, launch/scoping, assertion tallying, console capture,
process hooks, and log finalize at once), and the run's execution state is
implicit — scattered across the host, the loggers, and the `Output` writers.
There is no single object that _is_ the run: no addressable tree of what ran,
under what parent, producing which artifacts. The log model is one flat
collapsed `run.log`, so you cannot cheaply answer "what did this one action do"
without scanning everything, and cross-file ordering is not expressed.

We want a model where **the run is a first-class tree of action executions**,
each node owns its own state and its own log, and the whole tree serializes to a
machine-readable result — while keeping the primitives that already earn their
keep (the action builder, the event bus, `proc`).

## Goals

- **`ExecutionTree` owns run state.** One object holds the root action, every
  node, the global sequence counter, and produces the run's artifacts.
- **Each action execution is a node** (`ActionRun`) with identity, parent,
  tags, status, children, and its own log file.
- **Kill `nod`.** You call `instance.exec()`; parentage is ambient (the current
  node, tracked via `AsyncLocalStorage`).
- **Errors are never hidden.** Every action boundary try/catches, logs the
  error onto its own log, records failure on its node, and re-throws to whoever
  awaited it.
- **Cancellation is hierarchical.** Per-node abort signals chained to their
  parent; run-level teardown and per-node `.cancel()`; a `cancelled` terminal
  state distinct from `failed` and excluded from the verdict.
- **Layered, guard-enforced.** foundation → system → output → core → actions,
  imports only downward, with `output ✗ core` broken by dependency inversion and
  enforced by ESLint.
- **A clean artifact model:** a streamed `raw.jsonl` (everything, globally
  sequenced), a human `.log` per action, faceted rollups (`events.log`,
  `asserts.log`, `snapshots.log`) grouped by action path, and a `result.json`
  serializing the tree.
- **`console.*` is attributed** to the action it was called in, via async
  context.
- **Rename `spin` → `om`.**

## Non-goals

- **Not** porting the batteries (`actions/`: `command`, `watch`, `healthcheck`,
  `prompt`, `chromePage`, …). They re-home onto the new `action` primitive in a
  follow-up phase.
- **Not** the final swap of `__refactored/` into `src/` — also a follow-up.
- **No** new capabilities in the event bus, `proc`, or `FolderCache`; they are
  reused, adapted only to the new logger interface.
- **No** browser/CDP or pipeline changes.

## Terminology

Three things the current `action.ts` conflates:

| Term               | What it is                                                                                                                    | Created by                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **Action**         | The reusable definition: `action(name).emits<E>().ref<H>().run(exec)`                                                         | `action(name)`                        |
| **ActionInstance** | A definition bound to args; inert, holds no run state                                                                         | calling the action: `chromePage(url)` |
| **ActionRun**      | A live **node in the ExecutionTree**: identity, parent, tags, status, children, own logger, recorded asserts/snapshots/events | `instance.exec()`                     |

## Architecture

### ExecutionTree (module singleton)

A single module-level `ExecutionTree.current`, established when `om(...)` runs
and torn down at finalize. It owns:

- the **root** `ActionRun` (the `om` body),
- a **registry** of every node by id,
- the **global monotonic `sequence`** counter (every log entry across every node
  draws from it),
- the **`raw.jsonl`** stream writer (crash-insurance, live),
- the set of **unsettled nodes** (keep-alive: the run stays open while any node
  is unsettled; daemons keep it open until teardown),
- the **process-level hooks** (`SIGINT`, `uncaughtException`,
  `unhandledRejection`) that drive teardown and final output,
- **`finalize()`**, which closes streams and writes `result.json`.

Because it is a literal singleton, one process hosts one run. In-process tests
therefore get an explicit **`ExecutionTree.reset()`/`dispose()`** so each test
owns a fresh tree (this is the isolation cost of the singleton choice, paid once
in a test helper). `om()` throws if a run is already current and not disposed.

### Ambient current node (AsyncLocalStorage)

An `AsyncLocalStorage<ActionRun>` holds the **current node**. Two consumers:

1. **Parentage** — `instance.exec()` reads the current node as its parent
   (undefined only at the root, which `om` seeds).
2. **Console attribution** — the patched `console.*` resolves the current node
   and appends to its logger.

`exec` runs its body inside `als.run(node, () => …)`, so any `instance.exec()` or
`console.*` reached transitively — including inside awaited children — resolves
to the right node. Scoping composes automatically; nothing is threaded by hand.

### `om(body)`

Replaces `spin`. `om(async (ctx) => { … })`:

1. constructs `ExecutionTree.current` and the root `ActionRun` (id `main`, the
   one node exempt from the `<name>_<shortId>` scheme),
2. installs console capture + process hooks,
3. runs `body(ctx)` inside the root node's ALS scope,
4. keeps the run alive per the unsettled-nodes rule; on natural completion,
   `cancel()`, SIGINT, a fatal, **or the body itself throwing**, tears down and
   calls `finalize()` (see Teardown & finalize).

`ctx` for the body: `{ tag, assert, snapshot, cancel, signal }`.

## Action lifecycle & error model

`instance.exec()`:

0. **guards the ambient run** — if there is no live run in async context (no
   `ExecutionTree.current` / no ALS node), it **throws** a clear error: an action
   can only run inside a root `om(...)`. This is detected via async context, not a
   flag, so it catches an action called from plain top-level code, a stray import
   side-effect, or a callback that escaped the run's scope. (`step` guards the
   same way.)
1. resolves parent = ALS current node,
2. creates a child `ActionRun` (id, path, parent link, own logger, registered
   in the tree and added to unsettled),
3. writes a **launch reference line** into the parent's `.log`
   (`→ <child id> · <child .log path>`) and subscribes to the child's emitted
   events to **bubble them into the parent log**,
4. runs the exec inside `als.run(node)`, returning a **run handle**.

**Run handle** surface: `.done` (Promise of result — **rejects on failure**, and
with a `CancelledError` on cancel), `.ref` (the attached handle Promise — rejects
on failure/cancel), `.once(event)` (next emit; resolves `undefined` if the node
settles first), `.tag(name)`, `.cancel()` (abort this node's subtree — see
Cancellation).

**Error boundary** (in `exec`):

```
try {
  const result = await body(ctx, ...args);
  node.markDone(result);
  return result;
} catch (error) {
  node.logError(error);      // acknowledged on the node's own .log
  node.settle(error);        // classifies: node.signal aborted ⇒ 'cancelled', else 'failed'
  throw error;               // re-thrown to the awaiter
}
```

Nothing is swallowed. Awaiting `.done`/`.ref` really rejects. The boundary
**classifies** the throw: if the node's signal is aborted it settles `cancelled`
(a cascade, excluded from the verdict — see Cancellation); otherwise `failed`
(recorded, sets the verdict). An **un-awaited daemon** that fails or is cancelled
is still logged + recorded on its node; its rejection is absorbed by the tree
recorder (a `.catch` the tree attaches when it registers the node) so a
non-awaiter cannot be crashed by it. Process-level fatals are logged onto a
synthetic node, recorded, and drive teardown + `finalize()` so output is always
produced.

## Cancellation & abort

Cancellation is hierarchical and cooperative.

- **Per-node abort signals, chained.** Each `ActionRun` owns an `AbortController`
  chained to its parent — the root's parent is the run controller, so aborting the
  run cascades to everything, and aborting any node cascades to its subtree only.
  `ctx.signal` is _this node's_ signal; `proc` and framework waits bind to it.
- **Two entry points.** The `om` body's `ctx.cancel()` (plus `SIGINT` and fatals)
  aborts the **run** — full teardown, as today. A run handle's **`.cancel()`**
  aborts just **that node and its subtree**, leaving the rest of the run running
  (e.g. stop one watcher without ending the run).
- **Three terminal states — `ok` / `failed` / `cancelled`.** A node aborted before
  it settles naturally is `cancelled`, classified by the error boundary (node
  signal aborted ⇒ `cancelled`). A `cancelled` node is **not a verdict failure** —
  this is the cascade rule (an action that died only because something aborted it
  must not pollute `{ ok, failures[] }`).
- **Await semantics under cancel:**
  - `.once(event)` resolves `undefined` (settle-before-event rule already covers
    it) — safe, never rejects.
  - `.done` / `.ref` reject with a distinct **`CancelledError`** (exported), so an
    awaiter can tell cancellation from a real failure. Un-awaited handles are
    absorbed by the tree's per-node `.catch`, so a teardown-time cancel of a
    handle nobody awaited never becomes an unhandled rejection.
- **Cooperative, with teeth where it can.** Abort force-kills process trees
  (`proc`/`killTree`) and unblocks framework waits, but cannot preempt synchronous
  JS — actions must honor `ctx.signal` in loops/long waits. Same contract as today.
- **Keep-alive interaction.** Cancelling a node removes it (and its subtree) from
  the tree's unsettled set; if that empties the set, the run reaches natural
  completion and finalizes — identical to the existing "run stays alive while any
  node is unsettled" rule.

## Teardown & finalize

Whatever ends the run — natural completion, `cancel()`, a per-node `.cancel()`
that empties the tree, `SIGINT`, a process fatal, **or a thrown error (including
the `om` body throwing)** — converges on **one** ordered, idempotent finalize
path, and output is **always** produced.

- **Every throw is caught into the path.** An action's throw is handled at its
  boundary (recorded, doesn't tear the run down). The **`om` body** is itself
  wrapped: if it throws, the error is logged + recorded on the root node and the
  run is aborted — the "orchestrator crash ⇒ tear the whole run down" rule (a
  daemon the body already launched must not keep the process alive on a pipeline
  bug). Process-level `uncaughtException`/`unhandledRejection` route here too.
- **`beginTeardown(reason)` is the sole abort path, idempotent.** First caller
  transitions `open → closing`, narrates the reason once, and aborts the root
  controller (cascading to every node: procs killed via `killTree`, framework
  waits unblocked, daemons stopped). Later triggers are no-ops.
- **Ordered finalize, reached exactly once:** abort → await all in-flight nodes
  to settle (`Promise.allSettled`, so teardown waits for kills/flushes) → mark
  `closed` → append the final `finished` entry → **close the log and await the
  `raw.jsonl` stream fully flushed** (so a late write can't corrupt it) → write the
  per-action `.log` files, the faceted rollups, and `result.json` → restore
  `console` (undo patch-console) → remove the process hooks → set `process.exitCode`
  (1 iff the verdict has genuine failures; cancellations don't count).
- **Output-always guarantee.** Because finalize runs on _every_ exit including a
  throw or a hard fatal, the run never dies leaving an empty/partial log dir — the
  `raw.jsonl`, per-action logs, rollups, and `result.json` are the durable record
  even of a crash. (Incremental `raw.jsonl` streaming is the backstop if the
  process is `SIGKILL`ed before finalize.)
- **Hooks don't outlive the run.** SIGINT/uncaught/unhandled listeners and the
  console patch are installed at start and torn down at finalize, so a second run
  in the same process (or a test) starts clean.

## Scoping: actions, inline steps, and plain functions

We do **not** force consumers to wrap everything in an action. Instead the model
degrades gracefully and channels the work that matters into nodes:

- **Plain functions fold into their parent.** A normal JS function called inside
  an exec runs in that action's ALS scope, so its `console.*` attributes to the
  **nearest enclosing action's** log. It doesn't escape the tree; it just isn't
  sub-divided into its own node — the standard tracing stance (instrument spans
  worth having, not every function).
- **Capability-gating channels the important work.** The valuable operations —
  `proc` (tracked/killable process spawn), `emit`, `attach` (`.ref` handoff),
  `snapshot`, `assert` — are reachable **only through the action `ctx`**. A plain
  function literally cannot spawn a tracked process or publish a handle, so the
  operations that matter for charts/diagrams are actions by construction.
- **`step(name, fn)` — the inline anonymous action.** The one-liner that buys a
  node without a reusable definition. It creates a child `ActionRun` under the
  ALS-current node and runs `fn` as that node, gaining everything a full action
  gets — own id/path/`.log`, ALS scoping, tree membership, the error boundary —
  minus the reusable definition and the typed `emits`/`ref`/args surface. A free
  import (reads the ambient node), not a `ctx` member:

  ```ts
  await step("compute-manifest", async () => { … });  // own node, own log, chartable
  // ≈ action("compute-manifest").run(fn)().exec()
  ```

  `step` exists so the ceremony of a full action definition never tempts a
  consumer into a plain function for medium-weight, chart-worthy work.

No hard enforcement (no lint rule, no runtime block) is added — the ergonomics
plus capability-gating are the mechanism.

## Identity, tags, path

- **uuid** — full v4 on the node; **shortId** = first 8 hex.
- **id** = `${name}_${shortId}` → `chromePage_9f3c`. **The root is the sole
  exception**: its id is the plain name `main` (no suffix), so its file is
  `main.log` and its path segment is `main`.
- **path** = ancestry of ids joined `/` → `main/chromePage_9f3c/debug_77d1`.
- **parentId** stored on every node; root's is `null`.
- **tags** — a node can be tagged **multiple times**, from three surfaces,
  all accumulating onto the node's ordered tag list:
  1. **on the instance, before exec** — `command(…).tag("api").exec()` (buffered
     on the otherwise-inert instance and transferred onto the node at creation),
  2. **from inside, via ctx** — `ctx.tag("warmed")` during the exec,
  3. **on the run handle** — `const h = inst.exec(); h.tag("ready")`.

  Tagging is **timeline-visible**, not just metadata: each `tag` call appends a
  `tag`-level entry at that sequence point, so it renders **inline near events**
  in the node's `.log` and `raw.jsonl`. The accumulated set also annotates the
  node's **log-chunk header** and rides into `result.json` (`tags[]`). Tags are
  the human-facing markers a later chart/diagram groups and filters on.

- **children** — each node keeps an ordered collection of its child nodes.
- **`ActionRef`** — the identity `{ id, name, path, tags[] }`, rendered
  compactly as `name · path · [tags]`. It appears **wherever an action is pointed
  to** — the per-action log file's own header, a chunk/group header
  (asserts/events/snapshots), and log-file reference lines — **not on every row**.
  Individual rows stay lightweight (the `[seq ts path]` prefix); the full ref is
  resolvable from `result.json` by `nodeId`. (`tags[]` is the accumulated tag set
  at that point.)

## Logging model

- **Global sequence** — the tree owns one monotonic counter; every entry, on
  every node, is stamped with the next value. This is the cross-file merge key.
- **Logger — readable across actions, never writable by them.** The logger
  interface an action receives is **read-only**: it can **subscribe to / read the
  combined log across all actions** (so an action can gate on or react to what
  others logged — e.g. a wait-for-log-line action), but it **cannot append or
  attach**. Actions never write to the logger directly. The **sole action-facing
  output path is `console.*`** (below). Internally, every append fans out to (a)
  the tree's `raw.jsonl` stream — each row keyed by a **lightweight
  `{ sequence, ts, nodeId, path, level, source, message }`** (the full `ActionRef`
  is _not_ repeated per row; name/tags aren't) — and (b) the node's own human
  `.log` file. The owning action's name/tags are recoverable by `nodeId` from
  `result.json`, and shown wherever an action is pointed to (headers, references).
- **The only writers are framework-internal** — the console capture, `proc`'s
  stdout/stderr stream attach, and the event/assert/snapshot logging. None of
  these is exposed as a writable handle on the action `ctx`; an action produces
  freeform output through `console.*` and structured output through the typed
  channels (`emit` / `assert` / `snapshot`).
- **Per-file header** — each per-action `.log` opens with its `ActionRef` once
  (`name · path · [tags]`), so every line in the file is implicitly that action's
  and rows never repeat name/tags. (Tags added later in the run still appear
  inline as timeline `tag` entries; the header reflects the ref at file open.)
- **Line prefix** — each per-action `.log` line is prefixed
  `[<sequence> <iso-ts> <path>]` so any single file is independently orderable and
  cross-referenceable with `raw.jsonl` and sibling files.
- **Absolute filesystem links.** Every path that _links to a file_, written into
  any artifact — a child's `.log` reference in a parent log, a snapshot link
  (inline `→` and in `snapshots.log`), and `result.json`'s `logFile` / snapshot
  paths — is an **absolute OS path** (resolved from the run folder's absolute
  root), so a line copied out of any log resolves without knowing the run's cwd.
  This is a deliberate change from the old relative-path links. (The bracketed
  `<path>` in the line prefix is the _execution_ path — `main/chromePage_…` — a
  logical tree address, not a filesystem link, and stays as-is.)
- **Console capture — via `patch-console`.** Rather than hand-patch each method,
  the run installs [`patch-console`](https://github.com/vadimdemedes/patch-console),
  which intercepts the **full** console surface —
  `log`/`info`/`warn`/`error`/`debug`, **`table`**, **`trace`**,
  `group`/`groupCollapsed`/`groupEnd`, `dir`/`dirxml`, `count`/`countReset`,
  `time`/`timeEnd`/`timeLog`, `assert` — by swapping in a `Console` over captured
  streams, so Node's native formatting for `table`/`trace`/`group` is preserved.
  Its callback delivers `(stream, data)` (the target stream + the already-formatted
  string); we resolve the **ALS current node** and append `data` as an attributed
  entry to its logger. patch-console suppresses the raw stream (our collector owns
  all rendering); the pre-patch `console.log` is captured first as the terminal
  writer, and the patch is undone (restore fn) at `finalize()`.
  - **Level granularity** is stream-level: patch-console reports **stdout vs
    stderr**, not which method fired, so entry level maps stdout→`info`,
    stderr→`error` (the same mapping `proc` already uses). A distinct `warn`/`trace`
    level is intentionally _not_ derived — YAGNI unless we later need it.
- **What lands where** — a node's own asserts, snapshots, emitted events, and
  captured console output live **in that node's `.log`**, in place. A parent's
  `.log` additionally carries, for each immediate child, a narrative of the
  child's lifecycle:
  - the **launch reference** line (`→ <child id> · <absolute child .log path>`),
  - the child's **declared events** (bubbled),
  - the child's **system events + completion result** — `attached`, and
    `done`/`error` with the outcome summary (ok, or the error / exit code) — the
    "action system events, completion results" metadata recorded on the parent.

  The child's _full_ output (its console lines, its own asserts) stays in the
  child's file, linked, not copied up. This realizes "main.log contains just the
  immediate children + their events + completion metadata + pointers to their own
  logs."

## Output artifacts

```
logs/<run>/
  raw.jsonl                       # every entry, all nodes, global sequence; streamed live
  main.log                        # root: own asserts/snapshots/events + child refs, system events & bubbled events
  chromePage_9f3c.log
  chromePage_9f3c/debug_77d1.log  # per-action human logs, named by id; nested by path
  events.log                      # ALL declared events, grouped by action path
  asserts.log                     # ALL assertions, grouped by action path
  snapshots.log                   # ALL snapshots (name → file), grouped by action path
  snapshots/                      # the snapshot payload files themselves
  result.json                     # serialized ExecutionTree
```

- **`raw.jsonl`** — one line per entry, appended live for crash insurance and
  machine merging; the complete record.
- **per-action `.log`** — human-readable, one file per node, only that node's
  lines (plus child refs/bubbled events for a parent), prefixed as above.
- **`result.json`** — produced at `finalize()`. Per node:
  `{ id, uuid, name, path, parentId, tags[], status, outcome, startedAt, endedAt, duration, logFile, events[], assertions: {passed, failed, items[]}, snapshots[], children: [...] }`,
  plus a run-level `{ ok, failures[], startedAt, endedAt, duration, rawStream }`
  (verdict + time axis + a pointer to `raw.jsonl`) and the assertion totals.
- **Every node records the timing triple** `{ startedAt, endedAt, duration }`
  (`duration` stored, not left for consumers to compute). Together with the global
  `sequence` on every entry, this is deliberately enough to derive **flame graphs,
  Gantt charts, bottleneck analysis, idle time, concurrency, and the critical
  path** with no extra instrumentation.

### Faceted rollups

Beyond the per-action `.log` files (sliced _by action_), the run also emits
three **cross-cutting** files, each sliced _by facet_ and grouped under an
**action header** — the `ActionRef` rendered `name · path · [tags]` — walked in
tree order at `finalize()`:

- **`events.log`** — every declared event across the run, under its emitter's
  action header (seq · ts · key · payload-or-`→ snapshot`).
- **`asserts.log`** — every assertion, under its action header
  (`⊨ pass`/`⊨ FAIL` · message), ending with the run's pass/fail totals.
- **`snapshots.log`** — every snapshot, under its action header
  (`name → <absolute snapshots/<file> path>`), an index into the `snapshots/`
  payload dir.

The `ActionRef` is the **chunk header** for each group; the records beneath it are
bare (no per-row name/tags). The `path` in a record's `[seq ts path]` prefix ties
it back to its chunk and to `result.json` if a line is lifted out on its own.

They are pure projections of what nodes already recorded (also present
structured in `result.json` and interleaved in `raw.jsonl`), so they add no new
source of truth — just readable "all events / all asserts / all snapshots" views
for scanning and for later charting/diagramming.

## Replayability (a future UI is not designed here, but not precluded)

The artifacts are shaped so a later UI — a play/pause timeline with a diagram and
a synchronized log stream — can be built with **no changes to the runtime**. Two
planes serve it:

- **`raw.jsonl` = the replay stream.** Totally ordered by the global `sequence`,
  timestamped, and node-tagged, so replaying entries up to `sequence = N`
  reconstructs the exact run state at N (the scrubber source; events/asserts/tags
  become timeline markers).
- **`result.json` = the diagram skeleton.** The node tree with parent/children,
  the per-node timing triple `{ startedAt, endedAt, duration }`, and status gives
  the nodes/edges and the bars (flame graph / Gantt directly); the run-level
  timing gives the time axis; each row's `nodeId`/`path` correlates stream ↔
  diagram (scrub highlights the active node and streams its lines).

**Guarantee for playback:** node **lifecycle transitions** — `launch`, `attached`,
and settle (`done`/`error`/`cancelled`, with status) — are emitted as **first-class
sequenced entries in `raw.jsonl`**, so a player can rebuild "which nodes are live
at N" from the stream alone, without needing `result.json`. This is the one thing
that must hold in the implementation for a scrubbable UI to be possible later; it
is a non-goal to build the UI now.

## Layering & import boundaries

The code is organized into layers that may only import **downward**; an ESLint
guard makes an upward or illegal cross-import an error.

| Layer          | Folder (under `src/`) | Holds                                                                                                                                                                      | May import                 |
| -------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **foundation** | `foundation/`         | `Deferred`, `AsyncQueue`, `events` bus, `serialize`/`format`, id generation, `CancelledError`                                                                              | node stdlib only           |
| **system**     | `system/`             | `proc`/`killTree`, `FolderCache`, fs streams (the OS edge)                                                                                                                 | foundation                 |
| **output**     | `output/`             | log store + global sequence, per-node logger, **console capture**, `raw.jsonl`/`.log` writers, renderers, rollup + `result.json` serializers, `RunFolder`, `SnapshotStore` | foundation, system         |
| **core**       | `core/`               | `ExecutionTree`, `ActionRun`, ALS current-node/context, `action`, `step`, `om`                                                                                             | foundation, system, output |
| **actions**    | `actions/`            | the batteries (later phase)                                                                                                                                                | foundation, system, core   |
| **api**        | `index.ts`            | the public barrel                                                                                                                                                          | everything                 |

### The rule that matters: `output` must never import `core`

Naively, output needs the node (path/id) to attribute lines and group rollups,
and console capture needs the ALS current node — both `core` concepts, which
would create `output → core → output`. We break it by **inverting the
dependency**:

- The output layer works in terms of **plain attribution data**
  (`{ sequence, nodeId, path, level, source, message }`), never `ActionRun`. It
  defines its own DTO types; it does not import `core` even for types.
- **Console capture takes an injected `AttributionProvider`**
  (`() => ActionRef | undefined`, i.e. `{ id, name, path, tags }`); `core` wires
  it to the ALS at run start. Output never imports the ALS. (`ActionRef` is a plain
  data shape defined in **foundation**, so both `output` and `core` use it without
  either depending on the other.)
- **Rollups / serialization:** `core.finalize()` walks the tree and hands the
  output writers plain grouped DTOs. "Knows the tree" lives in core; "writes a
  grouped file" lives in output.

This keeps the output layer fully testable without the execution model, and the
`output ✗ core` guard is what stops the inversion from quietly eroding.

### Enforcement (zero-dependency)

omkit gets its own `eslint.config.js` extending the shared `baseConfig`, with one
per-layer `files` block using the built-in `no-restricted-imports` — no new
plugin:

```js
// forbid output from importing core (the cycle-breaker), etc.
{
  files: ["src/output/**/*.ts"],
  rules: { "no-restricted-imports": ["error", {
    patterns: [{ group: ["**/core/**"],
      message: "output must not import core — inject attribution (see spec)" }] }] },
},
{
  files: ["src/system/**/*.ts"],
  rules: { "no-restricted-imports": ["error", {
    patterns: [{ group: ["**/output/**", "**/core/**"],
      message: "system may only import foundation" }] }] },
},
// foundation forbids system/output/core; actions forbids output; etc.
```

The single `no-console` allowance the terminal writer needs (it owns the real
`console.log`) is scoped to that one file via a `files` override, mirroring how
`packages/tskb` exempts `src/cli/**`.

## Reuse & phasing

Work happens in `src/__refactored/`; pieces are moved/adapted **when needed**,
and the whole folder replaces `src/` at the very end.

- **Reused, adapted to the read-only logger:** `events` (bus), `Deferred`,
  `AsyncQueue`, `serialize`/`format`, `system/process` (`proc`, `killTree`),
  `system/fs/FolderCache`.
- **New runtime dependency:** `patch-console` (console capture). Node's
  `AsyncLocalStorage` (`node:async_hooks`) is built in, no dependency.
- **Rebuilt fresh (this spec):** `om`, `action`, `step`, `ExecutionTree`,
  `ActionRun`, the logging model (collector/stream/per-node loggers), console
  capture, the output/serialization (`raw.jsonl`, per-node `.log`, `result.json`),
  identity, tags, assert.
- **Follow-up phases (not this spec):** port the batteries onto the new
  `action`; final `__refactored/` → `src/` swap and public-surface (`index.ts`)
  reconciliation.

## Testing

Vitest, colocated per the package convention. A test helper wraps
`ExecutionTree.reset()` so each test owns a fresh singleton. Tests drive `om`
with in-line actions and assert against the **serialized tree** (`result.json`
shape) and captured entries — identity/path, parent linkage, tag attachment,
error re-throw + recorded failure, daemon-failure-does-not-crash, console
attribution, `step` producing its own node, plain-function output folding into
the parent, the faceted rollups grouping by path, the parent log carrying a
child's completion metadata, multi-tag accumulation from all three surfaces
with timeline-visible entries, `exec`/`step` throwing when called outside a root
`om`, run-level and per-node `.cancel()` (subtree aborts, `cancelled` excluded
from the verdict, `CancelledError` on awaited `.done`/`.ref`), and cross-file
sequence ordering. The existing behavior (assert
tally, snapshot capture) keeps equivalent coverage.

## Open naming notes (decide in the plan)

- The exec-trigger method: **`.exec()`** recommended (over `.call()`).
- The body context object name and whether `signal` also appears on the action
  ctx (today's TODOs) — resolve during implementation, default: `signal` on the
  action ctx, not the `om` body.

## Verification

- `npx tsc --noEmit` in `packages/omkit` — clean (the new tree lives beside the
  old core and must not break it).
- `npx vitest run packages/omkit` — the new core's tests pass; the existing
  suite stays green until the final swap phase retires it.
- `npm run lint` in `packages/omkit` — clean; the per-layer `no-restricted-imports`
  guards report no upward/illegal cross-layer imports (a deliberate bad import in a
  scratch check should error, proving the guard bites).
