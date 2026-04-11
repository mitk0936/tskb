# Ghost Intermediary Chains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the explorer show every intermediate filesystem directory as a ghost folder node when a declared folder owns modules at nested paths, so the tree matches real file-system depth.

**Architecture:** A new `buildGhostIntermediaryChains()` pass runs after `buildAllFolderChunksRecursively`. It detects path gaps between each declared folder's path and its owned modules/subfolders, builds a `GhostLevelBuilder` accumulator per intermediate directory, then synthesizes a `FolderChunk` for each gap level and stores it in the same `folderChunks` Map as real chunks. The declared folder's chunk is updated in-place to contain only direct children plus first-level ghost folder references.

**Tech Stack:** TypeScript, Vitest (existing test runner). Only `packages/tskb/src/core/explorer/transform.ts` and a new test file change.

---

## File Map

| File                                           | Change                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/tskb/src/core/explorer/transform.ts` | Add `GhostLevelBuilder` type, three private helpers, `buildGhostIntermediaryChains()` method, and one call-site in `transform()` |
| `tests/unit/explorer-transform.test.ts`        | New — unit tests for the ghost chain logic                                                                                       |

---

## Task 1: Write failing unit tests

**Files:**

- Create: `tests/unit/explorer-transform.test.ts`

- [ ] **Step 1.1: Create the test file**

```typescript
import { describe, it, expect } from "vitest";
import { transformGraph } from "../../packages/tskb/src/core/explorer/transform.js";
import type { KnowledgeGraph } from "../../packages/tskb/src/core/graph/types.js";

const ROOT = "__TSKB.ROOT__";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeGraph(partial: {
  folders?: Record<string, { desc: string; path?: string }>;
  modules?: Record<string, { desc: string; resolvedPath?: string }>;
  edges?: { from: string; to: string; type: string }[];
}): KnowledgeGraph {
  return {
    nodes: {
      folders: {
        [ROOT]: { id: ROOT, type: "folder", desc: "root", path: "." },
        ...Object.fromEntries(
          Object.entries(partial.folders ?? {}).map(([id, f]) => [
            id,
            { id, type: "folder" as const, ...f },
          ])
        ),
      },
      modules: Object.fromEntries(
        Object.entries(partial.modules ?? {}).map(([id, m]) => [
          id,
          { id, type: "module" as const, ...m },
        ])
      ),
      exports: {},
      terms: {},
      files: {},
      externals: {},
      flows: {},
      docs: {},
    },
    edges: partial.edges ?? [],
    metadata: {
      generatedAt: "",
      version: "0.0.0",
      rootPath: ".",
      stats: {
        folderCount: 0,
        moduleCount: 0,
        termCount: 0,
        exportCount: 0,
        fileCount: 0,
        externalCount: 0,
        flowCount: 0,
        docCount: 0,
        edgeCount: 0,
      },
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transformGraph — ghost intermediary chains", () => {
  it("leaves a module in place when it is a direct child of its folder", () => {
    const graph = makeGraph({
      folders: { pkg: { desc: "package", path: "pkg" } },
      modules: { "pkg.server": { desc: "server", resolvedPath: "pkg/server.ts" } },
      edges: [
        { from: ROOT, to: "pkg", type: "contains" },
        { from: "pkg.server", to: "pkg", type: "belongs-to" },
      ],
    });

    const result = transformGraph(graph);

    const pkgChunk = result.folders.get("pkg")!;
    expect(pkgChunk.modules).toHaveLength(1);
    expect(pkgChunk.modules[0].id).toBe("pkg.server");
    expect(pkgChunk.modules[0].parentId).toBe("pkg");
    // No ghost chunks
    const ghostKeys = [...result.folders.keys()].filter((k) => k !== "pkg");
    expect(ghostKeys).toHaveLength(0);
  });

  it("creates a ghost chunk for a single intermediate directory", () => {
    const graph = makeGraph({
      folders: { pkg: { desc: "package", path: "pkg" } },
      modules: { "pkg.server": { desc: "server", resolvedPath: "pkg/src/server.ts" } },
      edges: [
        { from: ROOT, to: "pkg", type: "contains" },
        { from: "pkg.server", to: "pkg", type: "belongs-to" },
      ],
    });

    const result = transformGraph(graph);

    const pkgChunk = result.folders.get("pkg")!;
    expect(pkgChunk.modules).toHaveLength(0);
    expect(pkgChunk.subfolders).toHaveLength(1);
    expect(pkgChunk.subfolders[0].id).toBe("pkg/src");
    expect(pkgChunk.subfolders[0].detail["_ghost"]).toBe("true");

    const ghostChunk = result.folders.get("pkg/src")!;
    expect(ghostChunk).toBeDefined();
    expect(ghostChunk.folderId).toBe("pkg/src");
    expect(ghostChunk.modules).toHaveLength(1);
    expect(ghostChunk.modules[0].id).toBe("pkg.server");
    expect(ghostChunk.modules[0].parentId).toBe("pkg/src");
  });

  it("creates ghost chunks for every level of a deep path gap", () => {
    const graph = makeGraph({
      folders: { pkg: { desc: "package", path: "pkg" } },
      modules: { "pkg.server": { desc: "server", resolvedPath: "pkg/a/b/server.ts" } },
      edges: [
        { from: ROOT, to: "pkg", type: "contains" },
        { from: "pkg.server", to: "pkg", type: "belongs-to" },
      ],
    });

    const result = transformGraph(graph);

    expect(result.folders.has("pkg/a")).toBe(true);
    expect(result.folders.has("pkg/a/b")).toBe(true);

    const pkgChunk = result.folders.get("pkg")!;
    expect(pkgChunk.modules).toHaveLength(0);
    expect(pkgChunk.subfolders.map((s) => s.id)).toContain("pkg/a");

    const aChunk = result.folders.get("pkg/a")!;
    expect(aChunk.modules).toHaveLength(0);
    expect(aChunk.subfolders.map((s) => s.id)).toContain("pkg/a/b");

    const abChunk = result.folders.get("pkg/a/b")!;
    expect(abChunk.modules).toHaveLength(1);
    expect(abChunk.modules[0].id).toBe("pkg.server");
    expect(abChunk.modules[0].parentId).toBe("pkg/a/b");
  });

  it("merges multiple modules through the same intermediary into one ghost chunk", () => {
    const graph = makeGraph({
      folders: { pkg: { desc: "package", path: "pkg" } },
      modules: {
        "pkg.a": { desc: "a", resolvedPath: "pkg/src/a.ts" },
        "pkg.b": { desc: "b", resolvedPath: "pkg/src/b.ts" },
      },
      edges: [
        { from: ROOT, to: "pkg", type: "contains" },
        { from: "pkg.a", to: "pkg", type: "belongs-to" },
        { from: "pkg.b", to: "pkg", type: "belongs-to" },
      ],
    });

    const result = transformGraph(graph);

    const ghostKeys = [...result.folders.keys()].filter((k) => k !== "pkg");
    expect(ghostKeys).toEqual(["pkg/src"]);

    const srcChunk = result.folders.get("pkg/src")!;
    expect(srcChunk.modules).toHaveLength(2);
    expect(srcChunk.modules.map((m) => m.id)).toEqual(expect.arrayContaining(["pkg.a", "pkg.b"]));
  });

  it("creates a ghost intermediary when a declared subfolder has a path gap", () => {
    const graph = makeGraph({
      folders: {
        pkg: { desc: "package", path: "pkg" },
        "pkg.core": { desc: "core", path: "pkg/src/core" },
      },
      modules: {},
      edges: [
        { from: ROOT, to: "pkg", type: "contains" },
        { from: "pkg", to: "pkg.core", type: "contains" },
      ],
    });

    const result = transformGraph(graph);

    expect(result.folders.has("pkg/src")).toBe(true);

    const pkgChunk = result.folders.get("pkg")!;
    expect(pkgChunk.subfolders.map((s) => s.id)).toContain("pkg/src");
    expect(pkgChunk.subfolders.map((s) => s.id)).not.toContain("pkg.core");

    const srcChunk = result.folders.get("pkg/src")!;
    expect(srcChunk.subfolders.map((s) => s.id)).toContain("pkg.core");
    expect(srcChunk.subfolders.find((s) => s.id === "pkg.core")?.parentId).toBe("pkg/src");
  });

  it("treats module as direct child when an intermediate path matches a declared folder", () => {
    const graph = makeGraph({
      folders: {
        pkg: { desc: "package", path: "pkg" },
        "pkg.src": { desc: "src", path: "pkg/src" }, // already declared
      },
      modules: {
        "pkg.server": { desc: "server", resolvedPath: "pkg/src/server.ts" },
      },
      edges: [
        { from: ROOT, to: "pkg", type: "contains" },
        { from: "pkg", to: "pkg.src", type: "contains" },
        { from: "pkg.server", to: "pkg", type: "belongs-to" }, // intentional misdeclaration
      ],
    });

    const result = transformGraph(graph);

    const pkgChunk = result.folders.get("pkg")!;
    // Module stays in declared folder — chain passes through a declared folder so no ghost routing
    expect(pkgChunk.modules.some((m) => m.id === "pkg.server")).toBe(true);
    // No new ghost chunk created for pkg/src (declared folder already owns that path)
    expect(result.folders.has("pkg/src")).toBe(false);
  });
});
```

- [ ] **Step 1.2: Run tests to confirm the right ones fail**

```bash
npx vitest run tests/unit/explorer-transform.test.ts
```

Expected output: the "direct child" test and the "declared folder guard" test pass (current behavior). The four ghost-chain tests fail — `result.folders.get("pkg/src")` returns `undefined`, assertions on `pkgChunk.modules.length === 0` fail.

---

## Task 2: Add `GhostLevelBuilder` type and private helper methods

**Files:**

- Modify: `packages/tskb/src/core/explorer/transform.ts`

- [ ] **Step 2.1: Add `GhostLevelBuilder` interface after the `ExplorerChunks` type (around line 64)**

Insert this block between `ExplorerChunks` and `export function transformGraph`:

```typescript
// ─── Ghost chain builder ──────────────────────────────────────────────────────

/** Accumulates content for one intermediate filesystem directory. */
interface GhostLevelBuilder {
  path: string;
  /** Declared folder path or another ghost path — the immediate parent. */
  parentPath: string;
  modules: ExplorerNode[];
  exports: ExplorerNode[];
  /** Declared subfolders whose path parent is this level. */
  subfolders: ExplorerNode[];
  /** Ghost paths one level deeper that are children of this one. */
  childGhostPaths: string[];
}
```

- [ ] **Step 2.2: Add three private helper methods to `GraphToExplorerTransformer`, after `buildFolderPathIndex`**

```typescript
  /**
   * Returns the ghost path chain between a declared folder and a target directory.
   * E.g. folderPath="pkg", itemDirPath="pkg/src/core" → ["pkg/src", "pkg/src/core"].
   * Returns [] when the target is a direct child (no gap).
   */
  private computeGhostChain(folderPath: string, itemDirPath: string): string[] {
    if (itemDirPath === folderPath) return [];
    if (!itemDirPath.startsWith(folderPath + "/")) return [];
    const rel = itemDirPath.slice(folderPath.length + 1); // e.g. "src/core"
    const parts = rel.split("/");
    return parts.map((_, i) => folderPath + "/" + parts.slice(0, i + 1).join("/"));
  }

  /**
   * Ensures every path in `chain` has a GhostLevelBuilder in `ghostLevels`
   * and links consecutive levels via `childGhostPaths`.
   */
  private ensureGhostChain(
    chain: string[],
    folderPath: string,
    ghostLevels: Map<string, GhostLevelBuilder>
  ): void {
    for (let i = 0; i < chain.length; i++) {
      const ghostPath = chain[i];
      if (!ghostLevels.has(ghostPath)) {
        ghostLevels.set(ghostPath, {
          path: ghostPath,
          parentPath: i === 0 ? folderPath : chain[i - 1],
          modules: [],
          exports: [],
          subfolders: [],
          childGhostPaths: [],
        });
      }
      if (i < chain.length - 1) {
        const level = ghostLevels.get(ghostPath)!;
        const next = chain[i + 1];
        if (!level.childGhostPaths.includes(next)) {
          level.childGhostPaths.push(next);
        }
      }
    }
  }

  /** Creates an ExplorerNode for a ghost intermediary folder. */
  private buildGhostFolderNode(ghostPath: string, parentId: string): ExplorerNode {
    const label = ghostPath.split("/").pop()!;
    return {
      id: ghostPath,
      type: "folder",
      label,
      description: "",
      path: ghostPath,
      parentId,
      edgeCount: 0,
      detail: {
        _ghost: "true",
        _hasChildren: "true", // patchFolderChildCounts will finalize this
        _childCount: "0",
      },
    };
  }
```

- [ ] **Step 2.3: Run tests — they still fail (no main method yet), but confirm no TypeScript errors**

```bash
npx vitest run tests/unit/explorer-transform.test.ts
```

Expected: same failures as before. No new errors.

---

## Task 3: Implement `buildGhostIntermediaryChains` and wire into pipeline

**Files:**

- Modify: `packages/tskb/src/core/explorer/transform.ts`

- [ ] **Step 3.1: Add `buildGhostIntermediaryChains` method to `GraphToExplorerTransformer`, after `buildFolderPathIndex`**

```typescript
  /**
   * Post-processing pass: for each declared folder, detects path gaps between
   * the folder's path and its owned modules/subfolders, synthesizes FolderChunks
   * for every intermediate directory, and updates the declared folder's chunk to
   * only contain direct children plus first-level ghost folder references.
   */
  private buildGhostIntermediaryChains(): void {
    const folderPathToId = this.buildFolderPathIndex();
    // Snapshot declared keys so newly created ghost chunks are not processed.
    const declaredFolderIds = [...this.folderChunks.keys()];

    for (const folderId of declaredFolderIds) {
      const folder = this.graph.nodes.folders[folderId];
      if (!folder?.path) continue;

      const folderPath = folder.path.replace(/\\/g, "/");
      const chunk = this.folderChunks.get(folderId)!;

      const ghostLevels = new Map<string, GhostLevelBuilder>();
      const directModules: ExplorerNode[] = [];
      const directExports: ExplorerNode[] = [];
      const directSubfolders: ExplorerNode[] = [];

      // ── Route modules ────────────────────────────────────────────────────
      for (const moduleNode of chunk.modules) {
        const modulePath = moduleNode.path?.replace(/\\/g, "/");
        if (!modulePath) {
          directModules.push(moduleNode);
          continue;
        }

        const moduleDirPath = modulePath.substring(0, modulePath.lastIndexOf("/"));
        const chain = this.computeGhostChain(folderPath, moduleDirPath);

        if (chain.length === 0 || chain.some((p) => folderPathToId.has(p))) {
          // Direct child, or chain passes through a declared folder — leave in place.
          directModules.push(moduleNode);
          directExports.push(...chunk.exports.filter((e) => e.parentId === moduleNode.id));
          continue;
        }

        this.ensureGhostChain(chain, folderPath, ghostLevels);
        const deepestPath = chain[chain.length - 1];
        const deepestLevel = ghostLevels.get(deepestPath)!;
        deepestLevel.modules.push({ ...moduleNode, parentId: deepestPath });
        deepestLevel.exports.push(
          ...chunk.exports
            .filter((e) => e.parentId === moduleNode.id)
            .map((e) => ({ ...e }))
        );
      }

      // ── Route subfolders ─────────────────────────────────────────────────
      for (const subfolderNode of chunk.subfolders) {
        const subfolderPath = subfolderNode.path?.replace(/\\/g, "/");
        if (!subfolderPath) {
          directSubfolders.push(subfolderNode);
          continue;
        }

        const subfolderParentPath = subfolderPath.substring(0, subfolderPath.lastIndexOf("/"));
        const chain = this.computeGhostChain(folderPath, subfolderParentPath);

        if (chain.length === 0 || chain.some((p) => folderPathToId.has(p))) {
          directSubfolders.push(subfolderNode);
          continue;
        }

        this.ensureGhostChain(chain, folderPath, ghostLevels);
        const deepestPath = chain[chain.length - 1];
        const deepestLevel = ghostLevels.get(deepestPath)!;
        deepestLevel.subfolders.push({ ...subfolderNode, parentId: deepestPath });
      }

      if (ghostLevels.size === 0) continue;

      // ── Create ghost chunks ──────────────────────────────────────────────
      for (const [ghostPath, level] of ghostLevels) {
        if (folderPathToId.has(ghostPath)) continue; // declared folder owns this path

        const childGhostNodes = level.childGhostPaths
          .filter((p) => !folderPathToId.has(p))
          .map((p) => this.buildGhostFolderNode(p, ghostPath));

        const moduleIdSet = new Set(level.modules.map((m) => m.id));
        const { internalEdges, externalEdges } = this.buildImportEdges(moduleIdSet);

        this.folderChunks.set(ghostPath, {
          kind: "folder",
          folderId: ghostPath,
          subfolders: [...level.subfolders, ...childGhostNodes],
          modules: level.modules,
          exports: level.exports,
          internalEdges,
          externalEdges,
        });
      }

      // ── Update declared folder chunk to only contain direct content ──────
      const firstLevelGhosts = [...ghostLevels.values()]
        .filter((l) => l.parentPath === folderPath && !folderPathToId.has(l.path))
        .map((l) => this.buildGhostFolderNode(l.path, folderId));

      const directModuleIdSet = new Set(directModules.map((m) => m.id));
      const { internalEdges, externalEdges } = this.buildImportEdges(directModuleIdSet);

      chunk.modules = directModules;
      chunk.exports = directExports;
      chunk.subfolders = [...directSubfolders, ...firstLevelGhosts];
      chunk.internalEdges = internalEdges;
      chunk.externalEdges = externalEdges;
    }
  }
```

- [ ] **Step 3.2: Wire the new pass into `transform()` — insert one line after `buildAllFolderChunksRecursively`**

Find this block in `transform()`:

```typescript
this.buildAllFolderChunksRecursively(ROOT_FOLDER_NAME);
this.injectGhostNodes();
```

Replace with:

```typescript
this.buildAllFolderChunksRecursively(ROOT_FOLDER_NAME);
this.buildGhostIntermediaryChains();
this.injectGhostNodes();
```

- [ ] **Step 3.3: Run unit tests — all 6 should pass**

```bash
npx vitest run tests/unit/explorer-transform.test.ts
```

Expected output:

```
✓ explorer-transform.test.ts (6)
  ✓ transformGraph — ghost intermediary chains (6)
    ✓ leaves a module in place when it is a direct child of its folder
    ✓ creates a ghost chunk for a single intermediate directory
    ✓ creates ghost chunks for every level of a deep path gap
    ✓ merges multiple modules through the same intermediary into one ghost chunk
    ✓ creates a ghost intermediary when a declared subfolder has a path gap
    ✓ treats module as direct child when an intermediate path matches a declared folder
```

If any test fails, read the error message, re-check the method implementation in Step 3.1 for the relevant case, fix, and re-run.

- [ ] **Step 3.4: Run the full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all 89 pre-existing tests pass plus the 6 new ones (95 total).

- [ ] **Step 3.5: Verify TypeScript compiles clean**

```bash
npx tsc --noEmit -p packages/tskb/tsconfig.json
```

Expected: no output (zero errors).

- [ ] **Step 3.6: Commit**

```bash
git add packages/tskb/src/core/explorer/transform.ts tests/unit/explorer-transform.test.ts
git commit -m "$(cat <<'EOF'
feat(explorer): synthesize ghost chunks for intermediate filesystem directories

When a declared folder owns a module at a nested path (e.g. pkg owns
pkg/src/core/server.ts), the transform now builds FolderChunks for every
intermediate directory (pkg/src, pkg/src/core) so the explorer tree matches
real filesystem depth. Ghost chunks are served identically to declared chunks;
no SPA or server changes required.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**Spec coverage:**

| Spec requirement                        | Covered by                                                             |
| --------------------------------------- | ---------------------------------------------------------------------- |
| Path gap detection for modules          | Task 3 — `computeGhostChain` on `moduleDirPath`                        |
| Path gap detection for subfolders       | Task 3 — `computeGhostChain` on `subfolderParentPath`                  |
| GhostLevelBuilder accumulation          | Task 2 — `ensureGhostChain` builds the map                             |
| Ghost chunk synthesis in `folderChunks` | Task 3 — `this.folderChunks.set(ghostPath, ...)`                       |
| parentId patching                       | Task 3 — `{ ...moduleNode, parentId: deepestPath }`                    |
| Guard against declared folder paths     | Task 3 — `chain.some(p => folderPathToId.has(p))`                      |
| Import edges per ghost chunk            | Task 3 — `this.buildImportEdges(moduleIdSet)`                          |
| Declared folder chunk mutation          | Task 3 — `chunk.modules = directModules; chunk.subfolders = [...]`     |
| `patchFolderChildCounts` still correct  | Unchanged — iterates `chunk.subfolders` which now includes ghost nodes |
| No SPA/server changes                   | Confirmed — only `transform.ts` modified                               |

**Placeholder scan:** No TBDs, no "similar to above", all code blocks present. ✓

**Type consistency:**

- `GhostLevelBuilder` defined in Task 2, used in Task 3 ✓
- `buildGhostFolderNode(ghostPath, parentId)` — called with two strings everywhere ✓
- `computeGhostChain(folderPath, itemDirPath)` — both calls match signature ✓
- `ensureGhostChain(chain, folderPath, ghostLevels)` — all three args supplied ✓
- `this.folderChunks.set(ghostPath, { kind: "folder", folderId, ... })` — matches `FolderChunk` type ✓
