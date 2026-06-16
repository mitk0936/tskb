# `tskb build --watch` — Design

**Date:** 2026-06-15
**Status:** Approved (pending spec review)

## Summary

Add a `--watch` flag to the `tskb build` CLI command. When present, the command runs an
initial build and then keeps running, rebuilding the knowledge graph whenever a watched
path changes. Without `--watch`, the command behaves exactly as today: a single one-shot
build that exits when done.

## Motivation

Authoring `.tskb.tsx` docs is iterative: you edit a doc, rebuild, inspect the graph
(explorer / search / pick), repeat. Re-running `tskb build` by hand each time is slow.
The docs also reference source code (modules/exports rendered as line-numbered stubs), so
edits to the described source shift the generated content too. A watch mode that rebuilds
on changes to both the docs and the relevant source closes that loop.

## Scope

### In scope

- A `--watch` flag on the `build` command, repeatable, each value a path (file or folder).
- Watching the build's existing doc glob **plus** every `--watch` path.
- Re-running the full `build()` pipeline on each debounced change.
- Resilient run-loop: keep watching across build errors; coalesce overlapping rebuilds.

### Out of scope (YAGNI)

- Configurable debounce interval (hardcoded 250ms).
- Incremental / partial rebuilds (each rebuild is the full one-shot pipeline).
- A watcher dependency such as `chokidar` (built-in `node:fs.watch` only).
- Coupling the explorer export (or any downstream step) into the rebuild loop — `--watch`
  rebuilds the graph only. The explorer will watch the graph itself, separately.

## Behavior

### Flag semantics

`--watch` is a **boolean** that means "watch the docs and rebuild — nothing else."
Optional `--watch-path` adds extra source paths. (Boolean + `--watch-path` rather than a
single value-taking `--watch`, because `node:util parseArgs` cannot make one flag work both
bare and with a value, and bare `--watch` is the common case.)

- **No `--watch`** → one-shot build, process exits with the build's exit code (unchanged).
- **`--watch`** → watch mode. The watched set is the doc glob's coverage — the set of
  directories the glob's matched files live under, watched recursively, so that **newly
  added** `.tskb.tsx` files are picked up (not just edits to existing ones).
- **`--watch --watch-path <path>` (repeatable)** → additionally watch each `<path>` (file
  watched directly; folder watched recursively).

Examples:

```
tskb build "docs/**/*.tskb.tsx" --project MyProj --watch
tskb build "docs/**/*.tskb.tsx" --project MyProj --watch --watch-path ./packages/foo/src --watch-path ./packages/bar/src
```

### Run loop

1. Run an initial `build(config)` once on startup, before watching begins.
2. Begin watching all paths in the watched set.
3. On a debounced change event (the watcher also reports which path changed, logged as
   `🔄 Change detected: <path>`):
   - If a build is already in flight → set a `dirty` flag and return.
   - Otherwise → run `build(config)`. When it finishes, if `dirty` was set, wait a quiet
     settle period (`settleMs`, default 250ms) so trailing/echo events coalesce, then run
     once more (changes during a build are never lost, but bursts collapse to a single
     delayed follow-up rather than cascading back-to-back rebuilds).
4. Repeat until SIGINT.

### Output

- `build()` already logs all progress to **stderr** via the logger (`info`/`verbose`);
  stdout is reserved for JSON query output. Watch mode preserves this.
- Watch mode adds stderr lines: a startup notice (`Watching N paths… (Ctrl+C to stop)`)
  and a per-rebuild separator with a timestamp, so the continuous log is readable.

### Error handling

- In watch mode a build failure is **caught**, logged via `error()`, and watching
  continues — the loop never calls `process.exit` on a build error. (This is the single
  intentional divergence from one-shot build, which exits non-zero on failure.)
- `fs.watch` handle errors are logged and do not crash the loop.

### Shutdown

- SIGINT (Ctrl+C) closes every `fs.watch` handle, cancels any pending debounce timer, and
  exits 0.

## Architecture

Three focused units. `build()` itself is left untouched as the pure one-shot pipeline.

### `cli/utils/watcher.ts` — reusable debounced multi-path watcher

- `watchPaths(paths: string[], onChange: () => void, opts?: { debounceMs?: number }): { close(): void }`
- Opens one `node:fs.watch` handle per path. Directories use `{ recursive: true }`
  (supported on Windows/macOS, and Linux on Node ≥ 20).
- Coalesces `fs.watch`'s noisy/duplicate events through a single debounce timer
  (default 250ms) so a burst of raw events fires `onChange` exactly once.
- Knows nothing about builds. Returns `close()` to tear down all handles and clear the
  timer.
- **Depends on:** `node:fs`.

### `cli/commands/watch.ts` — watch orchestration

- `watch(config: ExtractConfig, extraPaths: string[]): Promise<void>`
- Resolves the watched set: the directories covered by the doc glob (recursively) plus
  `extraPaths`.
- Runs the initial build, then wires `watchPaths` → the run loop (in-flight guard + dirty
  flag, error resilience, startup/rebuild logging).
- Registers the SIGINT handler for clean shutdown.
- **Depends on:** `build` (from `build.ts`), `watchPaths` (from `watcher.ts`), `glob`,
  the logger.

### `cli/index.ts` — routing

- Add `watch: { type: "boolean", default: false }` and
  `"watch-path": { type: "string", multiple: true }` to the `parseArgs` options.
- In the existing `build` case: if `values.watch` is true, route to
  `watch(config, values["watch-path"] ?? [])` instead of `build(config)`. Otherwise call
  `build(config)` as today.

## Data flow

```
change on watched path
  → fs.watch event                     (watcher.ts)
  → debounce 250ms + dedupe burst       (watcher.ts)
  → onChange()                          (watch.ts run loop)
  → build in flight? → dirty = true, return
  → else run build(config)
       → build logs progress to stderr (unchanged)
       → on finish: if dirty → clear + run again
  → stderr: "✓ Done!" then rebuild separator, keep watching
```

## Testing

- **`watcher.ts`** (unit, isolated): point at a temp dir, perform several rapid writes,
  assert `onChange` fires exactly once after the debounce window; assert `close()` stops
  further events.
- **`watch.ts` run loop** (unit, `build` mocked):
  - In-flight coalescing: trigger a change while a (slow, mocked) build runs → exactly one
    additional rebuild after it completes.
  - Error resilience: a `build` that throws is caught, logged, and the loop still responds
    to the next change.
- **CLI routing** (manual / lightweight): `--watch <path>` enters watch mode; no `--watch`
  still does a one-shot build and exits.

## Risks / notes

- `fs.watch` recursive support requires Node ≥ 20 on Linux; the project's primary
  environment is Windows where recursive watch is supported. Acceptable.
- Each rebuild runs the full pipeline including `.tskb/` wipe + Claude-skill / Copilot-
  instructions regeneration. This is intentional (correctness over speed) and matches the
  approved decision; generated files will be rewritten on every rebuild.
