import type { KnowledgeGraph, GraphEdge } from "../graph/types.js";
import { ROOT_FOLDER_NAME } from "../constants.js";

// ─── Explorer types (mirrors explorer-app/src/types.ts + chunk-types.ts) ─────
// Duplicated here so the CLI has no dependency on the SPA source.

export type NodeType =
  | "folder"
  | "module"
  | "export"
  | "doc"
  | "flow"
  | "term"
  | "external"
  | "file";

export interface ExplorerNode {
  id: string;
  type: NodeType;
  label: string;
  description: string;
  path?: string;
  parentId?: string;
  priority?: "essential" | "constraint" | "supplementary";
  edgeCount: number;
  detail: Record<string, string | string[]>;
}

export interface ExplorerLink {
  source: string;
  target: string;
  type: "imports" | "references" | "related-to" | "flow-step";
  label?: string;
}

export interface MetaChunk {
  kind: "meta";
  metadata: KnowledgeGraph["metadata"];
  root: ExplorerNode;
  topFolders: ExplorerNode[];
  docs: ExplorerNode[];
  flows: ExplorerNode[];
  terms: ExplorerNode[];
  externals: ExplorerNode[];
  crossEdges: ExplorerLink[];
}

export interface FolderChunk {
  kind: "folder";
  folderId: string;
  /** Direct sub-folders (when folder has no modules but contains other folders) */
  subfolders: ExplorerNode[];
  modules: ExplorerNode[];
  exports: ExplorerNode[];
  internalEdges: ExplorerLink[];
  externalEdges: ExplorerLink[];
}

// ─── Transform ───────────────────────────────────────────────────────────────

export interface ExplorerChunks {
  meta: MetaChunk;
  folders: Map<string, FolderChunk>;
}

export function transformGraph(graph: KnowledgeGraph): ExplorerChunks {
  // Build edge lookup helpers
  const edgesByFrom = groupEdges(graph.edges, "from");
  const edgesByTo = groupEdges(graph.edges, "to");

  // Helper: get parent folder for a module/export via belongs-to
  const parentOf = (id: string): string | undefined =>
    edgesByFrom.get(id)?.find((e) => e.type === "belongs-to")?.to;

  // ── Root node ──────────────────────────────────────────────────────────
  const rootRaw = graph.nodes.folders[ROOT_FOLDER_NAME];
  const root = rootRaw
    ? toExplorerNode(rootRaw.id, "folder", rootRaw.desc, {
        path: rootRaw.path,
        edgeCount: rootRaw.edgeCount ?? 0,
      })
    : makeFallbackRoot();

  // ── Top folders (direct children of root via `contains`) ──────────────
  const topFolderIds = new Set(
    (edgesByFrom.get(ROOT_FOLDER_NAME) ?? []).filter((e) => e.type === "contains").map((e) => e.to)
  );

  const topFolders: ExplorerNode[] = [];
  for (const id of topFolderIds) {
    const f = graph.nodes.folders[id];
    if (!f) continue;
    // Count how many modules belong to this folder (transitively) — proxy for childCount
    const moduleCount = countModulesInFolder(id, graph, edgesByTo);
    topFolders.push(
      toExplorerNode(f.id, "folder", f.desc, {
        path: f.path,
        parentId: ROOT_FOLDER_NAME,
        edgeCount: f.edgeCount ?? 0,
        detail: { _hasChildren: moduleCount > 0 ? "true" : "false" },
      })
    );
  }

  // ── Docs ──────────────────────────────────────────────────────────────
  const docs: ExplorerNode[] = Object.values(graph.nodes.docs).map((d) =>
    toExplorerNode(d.id, "doc", d.explains, {
      path: d.filePath,
      priority: d.priority as ExplorerNode["priority"],
      edgeCount: d.edgeCount ?? 0,
      detail: { format: d.format },
    })
  );

  // ── Flows ──────────────────────────────────────────────────────────────
  const flows: ExplorerNode[] = Object.values(graph.nodes.flows).map((f) =>
    toExplorerNode(f.id, "flow", f.desc, {
      priority: f.priority as ExplorerNode["priority"],
      edgeCount: f.edgeCount ?? 0,
      detail: { steps: String(f.steps.length) },
    })
  );

  // ── Terms ──────────────────────────────────────────────────────────────
  const terms: ExplorerNode[] = Object.values(graph.nodes.terms).map((t) =>
    toExplorerNode(t.id, "term", t.desc, { edgeCount: t.edgeCount ?? 0 })
  );

  // ── Externals ─────────────────────────────────────────────────────────
  const externals: ExplorerNode[] = Object.values(graph.nodes.externals).map((e) =>
    toExplorerNode(e.id, "external", e.desc, {
      edgeCount: e.edgeCount ?? 0,
      detail: e.metadata,
    })
  );

  // ── Cross-lane edges (doc/flow → code references) ─────────────────────
  const crossEdges: ExplorerLink[] = graph.edges
    .filter((e) => e.type === "references")
    .map((e) => ({ source: e.from, target: e.to, type: "references" as const }));

  // ── Folder chunks — build for ALL folders recursively ─────────────────
  // (not just topFolderIds; sub-folders like tskb.runtime also need chunks)
  const folderChunks = new Map<string, FolderChunk>();
  buildAllFolderChunks(ROOT_FOLDER_NAME, graph, edgesByFrom, edgesByTo, folderChunks);

  // Fix topFolders _hasChildren: true if they have a chunk (modules or sub-folders)
  for (const folder of topFolders) {
    folder.detail["_hasChildren"] = folderChunks.has(folder.id) ? "true" : "false";
  }

  return {
    meta: {
      kind: "meta",
      metadata: graph.metadata,
      root,
      topFolders,
      docs,
      flows,
      terms,
      externals,
      crossEdges,
    },
    folders: folderChunks,
  };
}

// ─── Chunk builder ────────────────────────────────────────────────────────────

/**
 * Recursively build a FolderChunk for every folder reachable from `parentId`.
 * Each chunk contains direct modules (+ their exports) and direct sub-folders.
 * Folders with neither are skipped.
 */
function buildAllFolderChunks(
  parentId: string,
  graph: KnowledgeGraph,
  edgesByFrom: Map<string, GraphEdge[]>,
  edgesByTo: Map<string, GraphEdge[]>,
  out: Map<string, FolderChunk>
): void {
  const childFolderIds = (edgesByFrom.get(parentId) ?? [])
    .filter((e) => e.type === "contains" && graph.nodes.folders[e.to])
    .map((e) => e.to);

  for (const folderId of childFolderIds) {
    // Direct modules
    const moduleIds = (edgesByTo.get(folderId) ?? [])
      .filter((e) => e.type === "belongs-to" && graph.nodes.modules[e.from])
      .map((e) => e.from);

    const moduleIdSet = new Set(moduleIds);

    // Direct sub-folders
    const subfolderIds = (edgesByFrom.get(folderId) ?? [])
      .filter((e) => e.type === "contains" && graph.nodes.folders[e.to])
      .map((e) => e.to);

    if (moduleIds.length === 0 && subfolderIds.length === 0) {
      // Still recurse into empty folders
      buildAllFolderChunks(folderId, graph, edgesByFrom, edgesByTo, out);
      continue;
    }

    const subfolders: ExplorerNode[] = subfolderIds.map((sfId) => {
      const sf = graph.nodes.folders[sfId]!;
      // Does this sub-folder itself have content?
      const sfHasContent =
        (edgesByTo.get(sfId) ?? []).some(
          (e) => e.type === "belongs-to" && graph.nodes.modules[e.from]
        ) ||
        (edgesByFrom.get(sfId) ?? []).some(
          (e) => e.type === "contains" && graph.nodes.folders[e.to]
        );
      return toExplorerNode(sf.id, "folder", sf.desc, {
        path: sf.path,
        parentId: folderId,
        edgeCount: sf.edgeCount ?? 0,
        detail: { _hasChildren: sfHasContent ? "true" : "false" },
      });
    });

    const modules: ExplorerNode[] = moduleIds.map((mid) => {
      const m = graph.nodes.modules[mid]!;
      const exportCount = (edgesByTo.get(mid) ?? []).filter(
        (e) => e.type === "belongs-to" && graph.nodes.exports[e.from]
      ).length;
      return toExplorerNode(m.id, "module", m.desc, {
        path: m.resolvedPath,
        parentId: folderId,
        edgeCount: m.edgeCount ?? 0,
        detail: {
          _hasChildren: exportCount > 0 ? "true" : "false",
          ...(m.morphologySummary ? { morphology: m.morphologySummary } : {}),
          ...(m.importsSummary ? { imports: m.importsSummary } : {}),
        },
      });
    });

    const exports: ExplorerNode[] = moduleIds.flatMap((mid) =>
      (edgesByTo.get(mid) ?? [])
        .filter((e) => e.type === "belongs-to" && graph.nodes.exports[e.from])
        .map((e) => {
          const ex = graph.nodes.exports[e.from]!;
          return toExplorerNode(ex.id, "export", ex.desc, {
            path: ex.resolvedPath,
            parentId: mid,
            edgeCount: ex.edgeCount ?? 0,
            detail: {
              ...(ex.typeSignature ? { signature: ex.typeSignature } : {}),
              ...(ex.morphologySummary ? { morphology: ex.morphologySummary } : {}),
            },
          });
        })
    );

    const internalEdges: ExplorerLink[] = graph.edges
      .filter((e) => e.type === "imports" && moduleIdSet.has(e.from) && moduleIdSet.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, type: "imports" as const }));

    const externalEdges: ExplorerLink[] = graph.edges
      .filter(
        (e) =>
          e.type === "imports" &&
          ((moduleIdSet.has(e.from) && !moduleIdSet.has(e.to)) ||
            (!moduleIdSet.has(e.from) && moduleIdSet.has(e.to)))
      )
      .map((e) => ({ source: e.from, target: e.to, type: "imports" as const }));

    out.set(folderId, {
      kind: "folder",
      folderId,
      subfolders,
      modules,
      exports,
      internalEdges,
      externalEdges,
    });

    // Recurse into sub-folders
    buildAllFolderChunks(folderId, graph, edgesByFrom, edgesByTo, out);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupEdges(edges: GraphEdge[], key: "from" | "to"): Map<string, GraphEdge[]> {
  const map = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    const k = e[key];
    const arr = map.get(k);
    if (arr) arr.push(e);
    else map.set(k, [e]);
  }
  return map;
}

function countModulesInFolder(
  folderId: string,
  graph: KnowledgeGraph,
  edgesByTo: Map<string, GraphEdge[]>
): number {
  return (edgesByTo.get(folderId) ?? []).filter(
    (e) => e.type === "belongs-to" && graph.nodes.modules[e.from]
  ).length;
}

interface NodeOpts {
  path?: string;
  parentId?: string;
  priority?: ExplorerNode["priority"];
  edgeCount?: number;
  detail?: Record<string, string>;
}

function toExplorerNode(
  id: string,
  type: NodeType,
  description: string,
  opts: NodeOpts = {}
): ExplorerNode {
  // Root node has a special id that shouldn't be split
  const label =
    id === ROOT_FOLDER_NAME
      ? "root"
      : id.includes(".")
        ? id.split(".").pop()!
        : (id.split("/").pop()! ?? id);
  return {
    id,
    type,
    label,
    description: description ?? "",
    path: opts.path,
    parentId: opts.parentId,
    priority: opts.priority,
    edgeCount: opts.edgeCount ?? 0,
    detail: opts.detail ?? {},
  };
}

function makeFallbackRoot(): ExplorerNode {
  return {
    id: ROOT_FOLDER_NAME,
    type: "folder",
    label: "root",
    description: "Repository root",
    edgeCount: 0,
    detail: { _hasChildren: "true" },
  };
}

// ─── Chunk file name helper ───────────────────────────────────────────────────

export function sanitizeFolderId(id: string): string {
  return id.replace(/[^a-z0-9.\-]/gi, "_");
}
