# Explorer Reload-on-Change (v1)

**Date:** 2026-06-16
**Status:** Approved design, pending implementation plan

## Goal

While `tskb explore` is running, if the knowledge graph (`.tskb/graph/*`) is
rebuilt — e.g. by `tskb build --watch` running in another terminal — the open
explorer page detects the change and shows a dialog offering to reload.

v1 is **manual reload only**: the page prompts; the user clicks Reload (a full
`location.reload()`). Live in-page patching is explicitly out of scope.

## Scope

**In scope**

- Change detection in the live `tskb explore` HTTP server.
- A browser poll + reload dialog, driven by a version token.
- Atomic graph writes so readers never observe a half-written graph.

**Out of scope (v1)**

- Live in-page patching / partial re-render.
- Change detection for the static export (it stays a frozen snapshot).
- WebSocket / SSE push (polling chosen for simplicity and robustness).

## Decisions

| Decision                    | Choice                                                 |
| --------------------------- | ------------------------------------------------------ |
| Export change detection     | None — static export is a frozen snapshot.             |
| Browser notification        | Client polling of a `/version` endpoint.               |
| Activation                  | Default-on; no new CLI flag.                           |
| Version token               | `meta.json` mtime (`mtimeMs`). No content hashing.     |
| Served vs. static detection | Explicit `meta.mode` field (`"served"` \| `"static"`). |

## Architecture

### 1. Atomic graph writes — `core/graph/writer.ts`

`writeSplitGraph` currently writes 11 JSON files sequentially with
`fs.writeFileSync`, `meta.json` **first**. Two changes:

- Add a `writeAtomic(file, data)` helper: write to `file + ".tmp"`, then
  `fs.renameSync` into place (atomic on the same filesystem). Apply to all
  files.
- **Reorder so `meta.json` is written last.** Once `meta.json`'s mtime flips,
  the entire new graph is guaranteed complete and consistent on disk —
  `meta.json` becomes the commit marker.

Consequence: the server's reload never has to defend against partial reads, and
the version token can be a plain mtime.

### 2. Version token

`meta.json`'s `mtimeMs`. The server holds `currentVersion = statSync(metaPath).mtimeMs`.

### 3. Meta chunk gains `mode` + `version` — `core/explorer/transform.ts`

Extend `MetaChunk` with:

```ts
mode?: "served" | "static";
version?: number; // meta.json mtimeMs; only set in served mode
```

`transformGraph` leaves them unset (neutral). Each delivery path sets `mode`
explicitly:

- **Served** (`serveExplorer`): `meta.mode = "served"`, `meta.version = mtimeMs`.
- **Static export** (`exportExplorer`): `meta.mode = "static"` written into
  `meta.json`.

An exported `meta.json` therefore literally records `"mode": "static"` —
self-documenting, and no behavior hinges on a missing field.

### 4. Server — `core/explorer/server.ts`

- Extract the cache-building block into `buildChunkCache(graph) → Map<string,string>`.
  Called once at startup; the served meta chunk is stamped with `mode: "served"`
  and the current `version`.
- Watch the **`.tskb/graph/` directory** (not the single `meta.json` file —
  watching one file across an atomic rename is flaky, notably on Windows) using
  the existing `watchPaths` util (`cli/utils/watcher.ts`). On a debounced event:
  `stat` `meta.json`; if `mtimeMs` changed, `loadGraph()` → rebuild cache →
  swap it in and update `currentVersion`.
- New route `GET /version` → `{ "version": <mtimeMs> }`, `Cache-Control: no-cache`.
- Inject `reloadGraph: () => KnowledgeGraph` and the graph dir (defaulting to the
  real `loadGraph` + resolved dir), following the dependency-injection pattern
  `cli/commands/watch.ts` already uses, for unit-testability.
- Close the watcher on SIGINT.

### 5. Browser — `explorer-app/`

**`ReloadWatcher` module** (new, `explorer-app/src/ui/ReloadWatcher.ts`):

1. Reads `meta.mode` from the already-loaded meta chunk (no extra boot request).
2. If `mode !== "served"` → disabled. Never polls, never prompts. This is what
   lets one SPA build serve both `explore` and the static export.
3. If `mode === "served"`: baseline = `meta.version`; poll `/version` every ~3s.
   On a token different from the baseline → show the dialog.
4. Network blips during polling are treated as "no change" (keep last baseline,
   keep polling).

**The dialog**: a _persistent_ bottom-center bar (not the auto-dismissing
`Toast`, which fades in 2s), styled to match Toast. Text: "Graph updated" with a
**Reload** button and a dismiss **✕**.

- **Reload** → `location.reload()` (re-fetches all chunks fresh from the now
  updated server cache).
- **Dismiss** → hides the bar and advances the baseline to the seen version, so
  it won't re-nag for that change but _will_ prompt again on the next rebuild.

**Wiring**: instantiate `ReloadWatcher` in `ExplorerApp.mount`
(`explorer-app/src/main.ts`), after initial data load.

## Data Flow

```
tskb build --watch  ──writes──▶  .tskb/graph/*.json (atomic; meta.json last)
                                          │
                       fs.watch (dir)     ▼
tskb explore server  ──detects mtime change──▶ loadGraph → buildChunkCache
                                          │                    (currentVersion = mtimeMs)
                       GET /version ◀─────┘
                                          ▲
browser ReloadWatcher  ──poll every ~3s──┘
   meta.version (baseline) ≠ /version  ──▶  show Reload dialog ──▶ location.reload()
```

## Error Handling

- **Partial reads**: eliminated by atomic writes + meta-last ordering.
- **Reload failure** (defensive): if `loadGraph()` throws, keep serving the
  previous good cache, log a warning, retry on the next change event.
- **Static export**: `meta.mode === "static"` → ReloadWatcher disabled; `/version`
  route simply doesn't exist (no server).
- **Polling network blips**: treated as "no change"; polling continues.

## Testing

Honors the test-coverage constraint
(`docs/src/tskb/constraints/constraint-test-coverage.tskb.tsx`).

**E2E (`tests/e2e/`)**

- Start `tskb explore` against the fixture; `GET /version` returns a number.
- Rewrite a graph file; confirm `/version` changes and `/chunks/meta.json`
  reflects the new graph and carries `mode: "served"`.
- Export the fixture; confirm `meta.json` records `mode: "static"`.

**Unit (`tests/unit/`, matching the `watch.ts` precedent)**

- `buildChunkCache` output + version derivation.
- `writeAtomic` / meta-last ordering in `writeSplitGraph`.
- `ReloadWatcher` polling / baseline / disable-when-static logic, with an
  injected `fetch`.

## Docs

- Update `docs/src/tskb/explorer/serve.tskb.tsx` (server now watches the graph
  dir, serves `/version`, stamps `meta.mode`/`meta.version`).
- Note atomic writes + meta-last ordering in the writer doc.
- Rebuild the graph via `npm run build:docs`.

## Cleanup (incidental)

`cli/commands/watch.ts` carries leftover debug cruft to remove: `info("manqqqqk")`
and four duplicated "Watching … for changes" log lines.
