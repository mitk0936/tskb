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
