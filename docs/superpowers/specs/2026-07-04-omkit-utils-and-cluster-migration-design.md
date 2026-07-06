# omkit utils layer + action-cluster migration to `__restructured`

**Date:** 2026-07-04
**Status:** implemented, verified
**Scope:** completes the `core/` → `__restructured/` migration for the action cluster and
introduces a shared `utils/` layer. Ends with `core/` deleted entirely.

## What moved

```
core/helpers/AsyncQueue.ts   → utils/AsyncQueue.ts
(new)                          utils/format.ts     (pad, ymd, hms — was duplicated inline)
core/output.ts serialize     → utils/serialize.ts
core/process.ts              → system/process/process.ts
core/folder-cache.ts         → system/fs/FolderCache.ts  (class, static methods)
core/events.ts               → orchestration/events/events.ts
core/action.ts               → orchestration/action/{action.ts, types.ts}   (split like spin)
core/output.ts               → RETIRED (converged onto the output singleton)
```

## Key decisions

- **Utils layer** (`__restructured/utils/`): `AsyncQueue.ts` (class), `format.ts`
  (`pad`, `ymd`, `hms` — the three local `pad` copies and both inline date builders now share
  these), `serialize.ts` (safe JSON). Leaf layer, no deps.
- **Single output owner.** `events`, `process`, and `action` previously pulled
  `captureSnapshot`/`artifactsFolder` from `core/output.ts`, which held its _own_ `runDir`/`seq`
  singletons — a latent split-brain against the new `output` singleton (two different
  `logs/…/<time>/` folders were possible). All three now use the one `output` singleton
  (`output.snapshots.captureJson`, `output.folder.artifacts()`), and `core/output.ts` is deleted.
- **Public API unchanged.** The output facade (`output/index.ts`) re-exposes bare
  `artifactsFolder`/`snapshot`/`captureSnapshot` as thin delegators over the singleton, so
  `src/index.ts`'s exported names are identical.
- **Action split** mirrors the spin module: `types.ts` (Outcome, ActionContext, ActionInstance,
  Action, ActionBuilder, …) + `action.ts` (`action()`, `producerOfRef`, engine).

## Layering (no cycles)

```
utils (leaf)
output/log/LogsCollector → utils/AsyncQueue
output (RunFolder/SnapshotStore/RunLog) → utils/{format,serialize}, log
system/process → output singleton (snapshot), log types
system/cache   → leaf
orchestration/events → output singleton (snapshot), log
orchestration/action → events, process, cache, output singleton
orchestration/spin   → action, output singleton
```

## Verification

- `tsc --noEmit` clean; `npm run clean && npm run build` clean (dist no longer contains `core/`).
- Full-stack smoke test: a real `action` (with a declared event + non-string payload) driven
  through `SpinHost` — verified the verdict, `run.jsonl`/`run.log`, the `⚡` event line, the
  event payload off-loaded to a snapshot file, `ctx.artifactsFolder` injection, and the timeline
  snapshot line. All passed.
- Downstream `wm` typechecks except one **pre-existing** error (`spin({ drain: false }, …)` arity
  in tskb-dev.ts) unrelated to this migration.

## Follow-ups (not in scope)

- `actions/*` (concrete reusable actions) still live at the old top-level and reach into
  `__restructured` — they migrate to `batteries/` next.
- The `spin(options, body)` overload (the `drain: false` form) is still unimplemented.
