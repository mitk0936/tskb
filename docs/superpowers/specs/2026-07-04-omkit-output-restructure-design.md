# omkit `output.ts` → distinct classes (restructure)

**Date:** 2026-07-04
**Status:** approved, implementing
**Scope:** staging only — build under `packages/omkit/src/__restructured/output/`. The live
`core/output.ts` and its importers are left untouched; migration/wiring is a later step.

## Problem

`core/output.ts` (245 lines) tangles three responsibilities behind module-level singletons
(`dir`, `made`, `ensuredSync`, `seq`):

1. **Folder** — per-run output directory (`logs/<name>/<date>/<time>/`), lazy creation,
   `artifactsFolder`.
2. **Snapshot** — sequenced JSON/text snapshot files + the `[snapshot]` timeline line.
3. **Log** — streaming `run.jsonl`/`run.log` and re-rendering the final collapsed `run.log`.

## Design

Three classes in a strict dependency layering; state that was module-global becomes instance
fields. Instances are constructed once (the "one run per process" invariant, now explicit) by a
composition facade.

```
folder/RunFolder.ts         ← no deps
snapshot/types.ts           ← SnapshotRef
snapshot/SnapshotStore.ts   ← RunFolder, Logger
log/RunLog.ts               ← RunFolder, SnapshotStore, render utils, system/fs
Output.ts                   ← composition root: owns folder + snapshots + runLog
index.ts                    ← constructs the one Output singleton, wired to global log
system/fs/streams.ts        ← closeStream() (extracted from streamClosed)
```

### `folder/RunFolder.ts` — owns the per-run directory

Absorbs `runDir`, `ensureDir`, `artifactsFolder`, `pipelineName`, `pad`; `dir`/`made`/`ensuredSync`
become private fields.

- `path(): string` — lazy `logs/<name>/<date>/<time>/`
- `ensure(): Promise<void>` — memoized async recursive mkdir
- `artifacts(): string` — sync-ensured absolute path (safe to hand a child proc)
- `resolve(name): string` — `join(path(), name)`
- `name(): string` — the run/pipeline name (for the log header)

### `snapshot/SnapshotStore.ts` — writes snapshot files

Absorbs `captureSnapshot`, `captureText`, `snapshot`, `serialize`, `seq`.
Constructor `(folder: RunFolder, log: Logger)`.

- `captureJson(name, value): SnapshotRef` (was `captureSnapshot`)
- `captureText(name, lines): SnapshotRef`
- `snapshot(name, value): Promise<string>` — `captureJson` + appends `[snapshot]` line via `log`
- `SnapshotRef` lives in `snapshot/types.ts`

### `log/RunLog.ts` — the `run.log` / `run.jsonl` writer

Absorbs `streamLog`, `writeLog`, `logHeader`; uses `closeStream` from `system/fs`.
Constructor `(folder: RunFolder, snapshots: SnapshotStore)` — calls `snapshots.captureText(...)`
to off-load collapsed runs.

- `stream(logs: LogsCollector): Promise<void>` (was `streamLog`)
- `write(): Promise<string>` (was `writeLog`)

### `system/fs/streams.ts`

- `closeStream(stream): Promise<void>` — flush + close a write stream, resolving on `close`/`error`
  (extracted verbatim from `streamClosed`; the one fs primitive used in two places).

### `output/Output.ts` — composition root (singleton)

A single `Output` class owns the run's output subsystem: it constructs `RunFolder`, then the
`SnapshotStore` and `RunLog` layered on it, and exposes them as `readonly` members
(`folder`, `snapshots`, `runLog`). The state that was module-global in the old `output.ts` (folder
path, mkdir latch, snapshot sequence) now has one owner.

`output/index.ts` constructs the **one** instance for the process — `export const output =
new Output(log)` — wired to the global log, mirroring how `global.ts` exposes the single `log`.
Callers reach a named layer rather than a free function:

```
output.folder.artifacts()             // this run's absolute output folder
output.snapshots.snapshot(name, val)  // JSON snapshot + timeline line
output.runLog.stream(logs) / .write() // stream, then re-render the collapsed run.log
```

## Non-goals / invariants

- **No behavior change.** Same lazy semantics, file names, sequence padding, collapse/off-load
  logic, and stream-close ordering (`run.jsonl` complete before `writeLog` re-renders `run.log`).
- No changes to `core/output.ts` or its consumers in this pass.
- Verified by `tsc --noEmit` on the package.
