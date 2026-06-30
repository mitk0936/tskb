# tswm — package extraction design

**Date:** 2026-06-26
**Status:** Approved (design), pending implementation plan

## Goal

Extract the engine currently prototyped in `wm/core/` into a standalone npm
workspace package, `tswm`, a companion to `tskb` for building simulations /
orchestrated runs. Follow the `tskb` package model (simple `tsc` build,
`package.json` with typed entry points). Rewire the existing `wm/` POC to consume
the package, proving the extraction end-to-end.

`tswm` is the operational/runtime layer (actions, runs, a shared log) to `tskb`'s
knowledge layer. The name is provisional ("tswm for now"); it may be renamed
(e.g. Praxis) before any publish.

## Scope

In scope:

- New package `packages/tswm` containing the `wm/core/*` engine and the four
  generic actions, exposed on two entry points.
- Rewiring `wm/` to import from `tswm` / `tswm/actions`.

Out of scope:

- `buildDocs` (tskb-specific) — stays in `wm/` as a consumer.
- The tskb-specific pipelines (`tskb-build`, `tskb-dev`) — stay in `wm/`.
- Publishing to npm, renaming, tests/docs for the new package beyond a README
  stub (can follow later).

## Package layout

```
packages/tswm/
  package.json
  tsconfig.json          # single emitting config — "tsc simple build"
  README.md
  LICENSE
  src/
    index.ts             # main entry  → "tswm"
    core/                # moved verbatim from wm/core/
      action.ts
      run.ts
      events.ts
      process.ts
      markers.ts
      output.ts
      log-collector/
        LogsCollector.ts
        global.ts
        render.ts
      helpers/
        AsyncQueue.ts
    actions/
      index.ts           # actions entry → "tswm/actions"
      command.ts
      watch.ts
      watch-dir.ts
      until-log.ts
```

The core files move verbatim from `wm/core/` — their internal relative imports
(`./log-collector/global.ts`, etc.) are unchanged. The four action files move
from `wm/src/actions/` into `src/actions/`; their imports change from
`../../core/action.ts` to `../core/action.ts` (one level shallower).

## Entry points

Two typed entry points in `package.json` `exports`:

- `"."` → `dist/index.js` (`src/index.ts`) — the core public API.
- `"./actions"` → `dist/actions/index.js` (`src/actions/index.ts`) — the reusable
  actions.

Actions import core by relative path (`../core/action.ts`), so both entries share
one compiled copy of the engine.

### `"tswm"` — curated core barrel

`src/index.ts` hand-picks the public surface (no `export *` — internal helpers
like `AsyncQueue`, `marker()`, and the renderer stay internal):

- Values: `action`, `run`, `snapshot`, `captureSnapshot`, `events`, `createProc`,
  `LogsCollector`, `log`.
- Types: `Action`, `ActionInstance`, `ActionBuilder`, `ActionContext`,
  `SystemGlobal`, `SystemEvents`, `InstanceEvents`, `NoEvents`, `Awaitable`,
  `Run`, `RunResult`, `RunOptions`, `RunState`, `ActionFailure`, `Emitter`,
  `EventHandler`, `EventMeta`, `Proc`, `Logger`, `LogEntry`, `LogInput`,
  `SubscribeOptions`, `SnapshotRef`.

(Final list confirmed against actual exports during implementation; the principle
is "public API only".)

### `"tswm/actions"` — actions barrel

`src/actions/index.ts` re-exports the four generic actions and their public
option/event types:

- `command` (+ `CommandParams`, `CommandOptions`)
- `watch` (+ `FileEvent`, `FileListener`, `WatchOptions`)
- `watchDir` (+ `WatchDirOptions`, `WatchDirEvents`)
- `untilLog` (+ `LogMatcher`, `UntilLogOptions`, `UntilLogEvents`)

`buildDocs` is **not** included — it is tskb-specific and stays in `wm/`.

## Build model

Keep the current `.ts`-extension imports (per decision), made emit-safe with
`rewriteRelativeImportExtensions`. One emitting `tsconfig.json` (no separate
`tsconfig.build.json`), modeled on `packages/tskb`:

```jsonc
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2023",
    "lib": ["ES2023"],
    "types": ["node"],
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "verbatimModuleSyntax": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
  },
  "include": ["src"],
}
```

`rewriteRelativeImportExtensions` rewrites `.ts` → `.js` in both emitted JS and
`.d.ts`, so the published package resolves correctly while source keeps explicit
`.ts` imports (TypeScript ≥ 5.7; the repo is on 5.9+).

### `package.json`

```jsonc
{
  "name": "tswm",
  "version": "0.0.1",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist", "LICENSE"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./actions": {
      "types": "./dist/actions/index.d.ts",
      "import": "./dist/actions/index.js",
    },
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "clean": "rimraf dist",
    "typecheck": "tsc --noEmit",
  },
  "dependencies": { "zx": "^8.8.5" },
  "devDependencies": {
    "@types/node": "^24",
    "rimraf": "^6.0.1",
    "typescript": "^5.9.3",
  },
}
```

## Rewiring `wm/`

`packages/*` and `wm` are both workspace members (root `package.json`
`workspaces`), so `packages/tswm` is picked up automatically.

1. Add `"tswm": "workspace:*"` to `wm/package.json` dependencies.
2. Delete `wm/core/` and the four generic actions from `wm/src/actions/`
   (`command.ts`, `watch.ts`, `watch-dir.ts`, `until-log.ts`) — now in the package.
   `wm/src/actions/` retains only `build-docs.ts`.
3. `wm/src/actions/build-docs.ts`: import `action` from `"tswm"` instead of
   `../../core/action.ts`.
4. `wm/src/pipelines/tskb-build.ts` and `tskb-dev.ts`:
   - `run`, `snapshot` from `"tswm"`.
   - `watchDir` / `watch` / `untilLog` / `command` from `"tswm/actions"`.
   - `buildDocs` from `./actions/build-docs.ts` (unchanged path).

### Runtime resolution note

`wm` runs its source `.ts` directly via node (type-stripping; e.g. root
`dev: node wm/src/pipelines/tskb-dev.ts`). After rewiring, `wm` imports `"tswm"`,
which node resolves through the workspace symlink to `packages/tswm/package.json`
→ `dist/`. So **`tswm` must be built before `wm` runs**. The workspace `build`
already builds packages before docs, so this holds for the normal flow; document
it so a bare `node wm/...` after a clean checkout is understood to need a build
first.

## Verification

- `npm run build` at the repo root builds `tswm` (via
  `build --workspaces`) and the rest; confirm `packages/tswm/dist` is produced
  with `.js` + `.d.ts` and that internal imports were rewritten to `.js`.
- `tsc --noEmit` over `wm` (its `typecheck` script) passes with the new imports.
- Run a pipeline (e.g. the `dev` flow) and confirm parity with pre-extraction
  behavior — actions launch, logs render, teardown works.

## Open questions / deferred

- Final README content and any `.tskb.tsx` docs for `tswm` — deferred.
- Eventual rename (Praxis) — deferred; only the `name` field and import
  specifiers change.
