# Ghost Intermediary Chains — Design Spec

**Date:** 2026-04-11  
**Status:** Approved

---

## Problem

The explorer currently shows the knowledge graph's declared folder structure, not the real filesystem depth. When a declared folder owns a module at a nested path — e.g. `packages/tskb` owns `packages/tskb/src/core/explorer/server.ts` — the module appears as a direct child of `packages/tskb` in the UI. The intermediate directories (`src`, `src/core`, `src/core/explorer`) are invisible.

This makes the explorer feel flat and disconnected from the actual file tree. The goal is to show every intermediate directory as a ghost folder node so the tree reflects real filesystem depth, while keeping the lazy-loading model intact.

---

## Solution Overview

Add a new pass to `transform.ts`: `buildGhostIntermediaryChains`. After building all real `FolderChunk`s, this pass scans each declared folder's modules and subfolders for path gaps, builds a ghost path tree for each declared folder, synthesizes a `FolderChunk` per intermediate directory, and re-parents content through the chain.

Ghost intermediary chunks are stored in the same `folderChunks` Map as real chunks. The server, SPA, store, loader, lane-engine, and all renderers need **zero changes** — ghost chunks are fetched and expanded identically to real ones.

---

## Scope

**In scope:**

- `packages/tskb/src/core/explorer/transform.ts` only
- Ghost `FolderChunk` synthesis for every intermediate directory between a declared folder's path and its owned modules/subfolders
- Correct `parentId` patching on re-routed content
- Import edge computation per ghost chunk
- Guard against overwriting already-declared folders

**Out of scope (follow-up):**

- `injectGhostNodes` coverage for undeclared `.ts` files inside ghost intermediary directories (those need `folder.children` data which ghost paths don't have)

---

## Transform Pipeline (updated)

```
buildAllFolderChunksRecursively(ROOT_FOLDER_NAME)
  ↓
buildGhostIntermediaryChains()           ← NEW
  ↓
injectGhostNodes()                       (unchanged)
  ↓
patchFolderChildCounts(topFolders)       (unchanged — ghost subfolders are already in chunk.subfolders)
```

---

## `buildGhostIntermediaryChains` Algorithm

### Path gap detection

Given a declared folder with path `P` and a module with `resolvedPath` `M`:

```
relPath   = M.replace(P + '/', '')         // e.g. "src/core/explorer/server.ts"
segments  = relPath.split('/')             // ["src", "core", "explorer", "server.ts"]
dirParts  = segments.slice(0, -1)          // ["src", "core", "explorer"]
```

If `dirParts.length === 0`: direct child, no gap, leave it in place.  
If `dirParts.length > 0`: build a ghost chain of absolute paths:

```
ghostPaths = dirParts.map((_, i) => P + '/' + dirParts.slice(0, i + 1).join('/'))
// ["packages/tskb/src", "packages/tskb/src/core", "packages/tskb/src/core/explorer"]
```

Same logic applies to direct subfolders (path gap between `P` and the subfolder's path, using all segments, not `slice(0, -1)`, since the subfolder itself is the destination).

### Ghost level accumulation

A `Map<ghostPath, GhostLevelBuilder>` is built per declared folder:

```ts
interface GhostLevelBuilder {
  path: string;
  parentPath: string; // declared folder path OR another ghost path
  modules: ExplorerNode[]; // modules whose resolvedPath parent === this path
  exports: ExplorerNode[]; // exports of those modules
  subfolders: ExplorerNode[]; // declared subfolders whose path parent === this path
  childGhostPaths: Set<string>; // next-level ghost paths that are children of this one
}
```

For each module with a gap:

1. Ensure each ghost path in the chain exists in the builder map (create if absent).
2. Link consecutive ghost levels: `chain[i].childGhostPaths.add(chain[i+1])`.
3. Place the module in the **deepest** ghost level (`chain[chain.length - 1]`).
4. Add `chain[0]` as a ghost subfolder reference in the **declared folder's chunk** (replacing the direct module).

For each direct subfolder with a gap:

1. Same chain construction, but the subfolder itself is the target, so the chain is all intermediate dirs only (not including the subfolder's own dir).
2. Place the subfolder in the deepest ghost level.
3. Add `chain[0]` to the declared folder's chunk.

### Guard: skip if path is a declared folder

Before creating a ghost chunk for a path, check:

```ts
if (this.folderPathToId.has(ghostPath)) continue; // declared folder already owns this path
```

### Chunk creation

For each `GhostLevelBuilder`, create a `FolderChunk`:

```ts
{
  kind: "folder",
  folderId: builder.path,
  subfolders: [
    ...builder.subfolders,                          // declared subfolders re-parented here
    ...builder.childGhostPaths mapped to ghost ExplorerNodes,
  ],
  modules: builder.modules,                         // parentId = builder.path
  exports: builder.exports,
  internalEdges: buildImportEdges(moduleIdSet).internalEdges,
  externalEdges: buildImportEdges(moduleIdSet).externalEdges,
}
```

Store in `this.folderChunks` (same Map as real chunks).

### Declared folder chunk mutation

After routing, the declared folder's chunk:

- `modules`: only modules that are **direct** children (no gap)
- `exports`: only exports of those direct modules
- `subfolders`: only declared subfolders that are **direct** children + ghost `ExplorerNode`s for first-level intermediaries
- `internalEdges` / `externalEdges`: recomputed for the reduced direct module set

---

## Ghost Folder ExplorerNode Shape

```ts
{
  id: "packages/tskb/src",        // path IS the id — matches chunk folderId
  type: "folder",
  label: "src",                   // last path segment
  description: "",
  path: "packages/tskb/src",
  parentId: "packages/tskb",      // declared folder id OR parent ghost path
  edgeCount: 0,
  detail: {
    _ghost: "true",               // renders as dashed card (existing SPA behaviour)
    _hasChildren: "true",         // patched by patchFolderChildCounts
    _childCount: "0",             // patched by patchFolderChildCounts
  },
}
```

`_ghost: "true"` → dashed card rendering (no code changes needed in SPA).  
`_hasChildren: "true"` → expand `+` button appears.  
`patchFolderChildCounts` already iterates all `chunk.subfolders` so ghost folder counts are updated automatically.

---

## parentId Patching

Modules and subfolders moved into a ghost chunk have their `parentId` set to the ghost path, not the declared folder id. This is the only structural change to already-built `ExplorerNode` objects. Since `buildModuleNode` and `buildSubfolderNode` accept `parentId` as a parameter, this is a call-site change only — no method signature changes needed.

---

## Import Edges

Each ghost chunk computes `internalEdges` and `externalEdges` using the same `buildImportEdges(moduleIdSet)` method on the class, where `moduleIdSet` is the set of modules that landed in that ghost chunk. This is identical to how real folder chunks compute edges.

---

## What Does Not Change

| Component                   | Status                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `server.ts`                 | No change — serves all `folderChunks` entries identically                                                      |
| `export.ts`                 | No change — writes all `folderChunks` entries to disk                                                          |
| `main.ts` / SPA expand flow | No change — ghost chunk fetch is identical to real chunk fetch                                                 |
| `lane-engine.ts`            | No change — ghost folders with `_hasChildren: "true"` already trigger placeholder ghost nodes for tree spacing |
| `graph-store.ts`            | No change                                                                                                      |
| `loader.ts`                 | No change                                                                                                      |
| `base.ts` / node renderer   | No change — `_ghost: "true"` already renders dashed                                                            |
| `EdgeRenderer.ts`           | No change                                                                                                      |

---

## Accepted Limitations

- **Undeclared files in ghost dirs**: `injectGhostNodes` only operates on declared graph folders (those with `folder.children` data). Files that sit inside a ghost intermediary directory but are not declared as modules will not appear. Follow-up work.
- **Ghost chunks have no scanner metadata**: No `folder.children`, no morphology, no description. The ghost node's description is empty string.
