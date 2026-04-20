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
  /** node-id → parent-id for every declared node; used to resolve nearest visible ancestor */
  parentOf: Record<string, string>;
  /** IDs of all folder nodes (declared + ghost intermediaries); used to decide which ancestors need chunk loading */
  folderIds: string[];
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

export function transformGraph(graph: KnowledgeGraph): ExplorerChunks {
  return new GraphToExplorerTransformer(graph).transform();
}

// ─── Transformer class ────────────────────────────────────────────────────────

class GraphToExplorerTransformer {
  private readonly graph: KnowledgeGraph;
  /** All edges indexed by their source node id */
  private readonly edgesBySource: Map<string, GraphEdge[]>;
  /** All edges indexed by their target node id */
  private readonly edgesByTarget: Map<string, GraphEdge[]>;
  private readonly folderChunks = new Map<string, FolderChunk>();

  constructor(graph: KnowledgeGraph) {
    this.graph = graph;
    this.edgesBySource = groupEdgesByKey(graph.edges, "from");
    this.edgesByTarget = groupEdgesByKey(graph.edges, "to");
  }

  transform(): ExplorerChunks {
    const root = this.buildRootNode();
    const topFolders = this.buildTopFolderNodes();
    const docs = this.buildDocNodes();
    const flows = this.buildFlowNodes();
    const terms = this.buildTermNodes();
    const externals = this.buildExternalNodes();
    const crossEdges = this.buildCrossEdges();

    this.buildAllFolderChunksRecursively(ROOT_FOLDER_NAME);
    this.buildGhostIntermediaryChains();
    this.injectGhostNodes();
    this.patchFolderChildCounts(topFolders);
    this.sortAllChunks();
    topFolders.sort((a, b) => a.label.localeCompare(b.label));

    const parentOf = this.buildParentOf();
    const folderIds = [...this.folderChunks.keys()];

    return {
      meta: {
        kind: "meta",
        metadata: this.graph.metadata,
        root,
        topFolders,
        docs,
        flows,
        terms,
        externals,
        crossEdges,
        parentOf,
        folderIds,
      },
      folders: this.folderChunks,
    };
  }

  // ── Meta chunk builders ────────────────────────────────────────────────────

  private buildRootNode(): ExplorerNode {
    const rawRoot = this.graph.nodes.folders[ROOT_FOLDER_NAME];
    if (!rawRoot) return makeFallbackRoot();
    return toExplorerNode(rawRoot.id, "folder", rawRoot.desc, {
      path: rawRoot.path,
      edgeCount: rawRoot.edgeCount ?? 0,
    });
  }

  private buildTopFolderNodes(): ExplorerNode[] {
    const rootOutgoingEdges = this.edgesBySource.get(ROOT_FOLDER_NAME) ?? [];
    const topFolderIds = rootOutgoingEdges.filter((e) => e.type === "contains").map((e) => e.to);

    return topFolderIds.flatMap((folderId) => {
      const folder = this.graph.nodes.folders[folderId];
      if (!folder) return [];

      const directModuleCount = this.countDirectModules(folderId);
      const directSubfolderCount = this.countDirectSubfolders(folderId);
      const hasModulesAnywhere = this.countDirectModules(folderId) > 0;

      return [
        toExplorerNode(folder.id, "folder", folder.desc, {
          path: folder.path,
          parentId: ROOT_FOLDER_NAME,
          edgeCount: folder.edgeCount ?? 0,
          detail: {
            _hasChildren: hasModulesAnywhere ? "true" : "false",
            _childCount: String(directModuleCount + directSubfolderCount),
            ...(folder.boundary ? { boundary: folder.boundary } : {}),
          },
        }),
      ];
    });
  }

  private buildDocNodes(): ExplorerNode[] {
    return Object.values(this.graph.nodes.docs).map((doc) => {
      // Derive a human-readable label from the file path, stripping the .tskb.tsx suffix
      const filename =
        doc.filePath
          ?.split("/")
          .pop()
          ?.replace(/\.tskb\.tsx?$/, "") ?? doc.id;
      return toExplorerNode(doc.id, "doc", doc.explains, {
        path: doc.filePath,
        priority: doc.priority as ExplorerNode["priority"],
        edgeCount: doc.edgeCount ?? 0,
        detail: { format: doc.format },
        label: filename,
      });
    });
  }

  private buildFlowNodes(): ExplorerNode[] {
    return Object.values(this.graph.nodes.flows).map((flow) =>
      toExplorerNode(flow.id, "flow", flow.desc, {
        priority: flow.priority as ExplorerNode["priority"],
        edgeCount: flow.edgeCount ?? 0,
        detail: { steps: String(flow.steps.length) },
      })
    );
  }

  private buildTermNodes(): ExplorerNode[] {
    return Object.values(this.graph.nodes.terms).map((term) =>
      toExplorerNode(term.id, "term", term.desc, { edgeCount: term.edgeCount ?? 0 })
    );
  }

  private buildExternalNodes(): ExplorerNode[] {
    return Object.values(this.graph.nodes.externals).map((external) =>
      toExplorerNode(external.id, "external", external.desc, {
        edgeCount: external.edgeCount ?? 0,
        detail: external.metadata,
      })
    );
  }

  private buildCrossEdges(): ExplorerLink[] {
    return this.graph.edges
      .filter((e) => e.type === "related-to" || e.type === "imports")
      .map((e) => ({
        source: e.from, // importer A
        target: e.to, // imported B
        type: e.type as "related-to" | "imports",
        ...(e.label ? { label: e.label } : {}),
      }));
  }

  // ── Folder chunk builders ──────────────────────────────────────────────────

  /**
   * Recursively build a FolderChunk for every folder reachable from `parentId`.
   * Each chunk contains direct modules (+ their exports) and direct sub-folders.
   * Folders with neither are skipped (but still recursed into).
   */
  private buildAllFolderChunksRecursively(parentId: string): void {
    const childFolderIds = (this.edgesBySource.get(parentId) ?? [])
      .filter((e) => e.type === "contains" && this.graph.nodes.folders[e.to])
      .map((e) => e.to);

    for (const folderId of childFolderIds) {
      const directModuleIds = this.getDirectModuleIds(folderId);
      const directSubfolderIds = this.getDirectSubfolderIds(folderId);

      if (directModuleIds.length === 0 && directSubfolderIds.length === 0) {
        // Folder is empty — skip chunk creation but keep recursing
        this.buildAllFolderChunksRecursively(folderId);
        continue;
      }

      const moduleIdSet = new Set(directModuleIds);

      const subfolders = directSubfolderIds.map((sfId) => this.buildSubfolderNode(sfId, folderId));
      const modules = directModuleIds.map((moduleId) => this.buildModuleNode(moduleId, folderId));
      const exports = directModuleIds.flatMap((moduleId) => this.buildExportNodes(moduleId));
      const { internalEdges, externalEdges } = this.buildImportEdges(moduleIdSet);

      this.folderChunks.set(folderId, {
        kind: "folder",
        folderId,
        subfolders,
        modules,
        exports,
        internalEdges,
        externalEdges,
      });

      this.buildAllFolderChunksRecursively(folderId);
    }
  }

  private buildSubfolderNode(subfolderId: string, parentFolderId: string): ExplorerNode {
    const subfolder = this.graph.nodes.folders[subfolderId]!;
    const directModuleCount = this.countDirectModules(subfolderId);
    const directSubfolderCount = this.countDirectSubfolders(subfolderId);
    const hasContent = directModuleCount > 0 || directSubfolderCount > 0;

    return toExplorerNode(subfolder.id, "folder", subfolder.desc, {
      path: subfolder.path,
      parentId: parentFolderId,
      edgeCount: subfolder.edgeCount ?? 0,
      detail: {
        _hasChildren: hasContent ? "true" : "false",
        _childCount: String(directModuleCount + directSubfolderCount),
        ...(subfolder.boundary ? { boundary: subfolder.boundary } : {}),
      },
    });
  }

  private buildModuleNode(moduleId: string, parentFolderId: string): ExplorerNode {
    const module = this.graph.nodes.modules[moduleId]!;
    const exportCount = (this.edgesByTarget.get(moduleId) ?? []).filter(
      (e) => e.type === "belongs-to" && this.graph.nodes.exports[e.from]
    ).length;

    return toExplorerNode(module.id, "module", module.desc, {
      path: module.resolvedPath,
      parentId: parentFolderId,
      edgeCount: module.edgeCount ?? 0,
      detail: {
        _hasChildren: exportCount > 0 ? "true" : "false",
        ...(module.morphologySummary ? { morphology: module.morphologySummary } : {}),
        ...(module.importsSummary ? { imports: module.importsSummary } : {}),
        ...(module.morphology?.length ? { code: module.morphology } : {}),
        ...(module.imports?.length ? { importLines: module.imports } : {}),
      },
    });
  }

  private buildExportNodes(moduleId: string): ExplorerNode[] {
    return (this.edgesByTarget.get(moduleId) ?? [])
      .filter((e) => e.type === "belongs-to" && this.graph.nodes.exports[e.from])
      .map((e) => {
        const exportNode = this.graph.nodes.exports[e.from]!;
        return toExplorerNode(exportNode.id, "export", exportNode.desc, {
          path: exportNode.resolvedPath,
          parentId: moduleId,
          edgeCount: exportNode.edgeCount ?? 0,
          detail: {
            ...(exportNode.typeSignature ? { signature: exportNode.typeSignature } : {}),
            ...(exportNode.morphologySummary ? { morphology: exportNode.morphologySummary } : {}),
          },
        });
      });
  }

  private buildImportEdges(moduleIdSet: Set<string>): {
    internalEdges: ExplorerLink[];
    externalEdges: ExplorerLink[];
  } {
    const importEdges = this.graph.edges.filter((e) => e.type === "imports");

    const internalEdges = importEdges
      .filter((e) => moduleIdSet.has(e.from) && moduleIdSet.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, type: "imports" as const }));

    const externalEdges = importEdges
      .filter((e) => moduleIdSet.has(e.from) !== moduleIdSet.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, type: "imports" as const }));

    return { internalEdges, externalEdges };
  }

  // ── Ghost node injection ───────────────────────────────────────────────────

  /**
   * For every folder whose scanner-recorded children include items not already
   * in the graph, inject ghost ExplorerNodes so they appear in the UI.
   */
  private injectGhostNodes(): void {
    const folderPathToId = this.buildFolderPathIndex();

    for (const [folderId, folder] of Object.entries(this.graph.nodes.folders)) {
      if (!folder.path) continue;

      const childFiles = folder.children?.files ?? [];
      const childFolders = folder.children?.folders ?? [];
      if (!childFiles.length && !childFolders.length) continue;

      const folderPath = folder.path.replace(/\\/g, "/");
      const chunk = this.folderChunks.get(folderId);

      const ghostModules = this.buildGhostModuleNodes(childFiles, folderPath, folderId, chunk);
      const ghostSubfolders = this.buildGhostSubfolderNodes(
        childFolders,
        folderPath,
        folderId,
        chunk,
        folderPathToId
      );

      if (ghostModules.length === 0 && ghostSubfolders.length === 0) continue;

      if (!chunk) {
        this.folderChunks.set(folderId, {
          kind: "folder",
          folderId,
          subfolders: ghostSubfolders,
          modules: ghostModules,
          exports: [],
          internalEdges: [],
          externalEdges: [],
        });
      } else {
        chunk.modules.push(...ghostModules);
        chunk.subfolders.push(...ghostSubfolders);
      }
    }
  }

  private buildGhostModuleNodes(
    childFiles: { name: string }[],
    folderPath: string,
    parentFolderId: string,
    chunk: FolderChunk | undefined
  ): ExplorerNode[] {
    const knownModulePaths = new Set(chunk?.modules.map((m) => m.path) ?? []);

    return childFiles
      .filter(({ name }) => {
        if (!name.endsWith(".ts") && !name.endsWith(".tsx")) return false;
        if (name.endsWith(".d.ts")) return false;
        return !knownModulePaths.has(`${folderPath}/${name}`);
      })
      .map(({ name }) => ({
        id: `${folderPath}/${name}`,
        type: "module" as const,
        label: name.replace(/\.tsx?$/, ""),
        description: "",
        path: `${folderPath}/${name}`,
        parentId: parentFolderId,
        edgeCount: 0,
        detail: { _ghost: "true", _hasChildren: "false" },
      }));
  }

  private buildGhostSubfolderNodes(
    childFolders: { name: string }[],
    folderPath: string,
    parentFolderId: string,
    chunk: FolderChunk | undefined,
    folderPathToId: Map<string, string>
  ): ExplorerNode[] {
    const knownSubfolderPaths = new Set(
      (chunk?.subfolders ?? [])
        .map((sf) => sf.path?.replace(/\\/g, "/"))
        .filter(Boolean) as string[]
    );

    return childFolders
      .filter(({ name }) => {
        const childPath = `${folderPath}/${name}`;
        // Skip if it's already a known graph folder
        if (folderPathToId.has(childPath)) return false;
        // Skip if already in the chunk's subfolders
        if (knownSubfolderPaths.has(childPath)) return false;
        // Skip transparent intermediaries: a folder whose declared sub-folders
        // are already children of this path (e.g. "src" when components/graph/etc exist)
        const hasDeclaredDescendants = (chunk?.subfolders ?? []).some((sf) =>
          sf.path?.replace(/\\/g, "/").startsWith(childPath + "/")
        );
        return !hasDeclaredDescendants;
      })
      .map(({ name }) => ({
        id: `${folderPath}/${name}`,
        type: "folder" as const,
        label: name,
        description: "",
        path: `${folderPath}/${name}`,
        parentId: parentFolderId,
        edgeCount: 0,
        detail: { _ghost: "true", _hasChildren: "false", _childCount: "0" },
      }));
  }

  private buildFolderPathIndex(): Map<string, string> {
    const folderPathToId = new Map<string, string>();
    for (const [id, folder] of Object.entries(this.graph.nodes.folders)) {
      if (folder.path) folderPathToId.set(folder.path.replace(/\\/g, "/"), id);
    }
    return folderPathToId;
  }

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
          ...chunk.exports.filter((e) => e.parentId === moduleNode.id).map((e) => ({ ...e }))
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

  /** Sort subfolders and modules alphabetically (by path segment, matching what cards display). */
  private sortAllChunks(): void {
    // Cards display the last path segment, not the id-derived label, so sort by that.
    const seg = (n: ExplorerNode) => (n.path?.split("/").pop() ?? n.label).toLowerCase();
    for (const chunk of this.folderChunks.values()) {
      chunk.subfolders.sort((a, b) => seg(a).localeCompare(seg(b)));
      chunk.modules.sort((a, b) => seg(a).localeCompare(seg(b)));
    }
  }

  // ── Post-processing ────────────────────────────────────────────────────────

  /**
   * Update `_hasChildren` and `_childCount` on all folder nodes after ghost
   * injection is complete, so counts are accurate.
   */
  private patchFolderChildCounts(topFolders: ExplorerNode[]): void {
    for (const folder of topFolders) {
      this.patchFolderNodeDetail(folder);
    }
    for (const chunk of this.folderChunks.values()) {
      for (const subfolder of chunk.subfolders) {
        this.patchFolderNodeDetail(subfolder);
      }
    }
    // Top folders without a chunk have no children
    for (const folder of topFolders) {
      if (!this.folderChunks.has(folder.id)) {
        folder.detail["_hasChildren"] = "false";
      }
    }
  }

  private patchFolderNodeDetail(node: ExplorerNode): void {
    if (node.type !== "folder") return;
    const chunk = this.folderChunks.get(node.id);
    if (!chunk) return;
    node.detail["_hasChildren"] = "true";
    node.detail["_childCount"] = String(chunk.modules.length + chunk.subfolders.length);
  }

  /** Builds a flat node-id → parent-id map across all folder chunks. */
  private buildParentOf(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const chunk of this.folderChunks.values()) {
      for (const sf of chunk.subfolders) if (sf.parentId) map[sf.id] = sf.parentId;
      for (const mod of chunk.modules) if (mod.parentId) map[mod.id] = mod.parentId;
      for (const exp of chunk.exports) if (exp.parentId) map[exp.id] = exp.parentId;
    }
    return map;
  }

  // ── Edge/node query helpers ────────────────────────────────────────────────

  private getDirectModuleIds(folderId: string): string[] {
    return (this.edgesByTarget.get(folderId) ?? [])
      .filter((e) => e.type === "belongs-to" && this.graph.nodes.modules[e.from])
      .map((e) => e.from);
  }

  private getDirectSubfolderIds(folderId: string): string[] {
    return (this.edgesBySource.get(folderId) ?? [])
      .filter((e) => e.type === "contains" && this.graph.nodes.folders[e.to])
      .map((e) => e.to);
  }

  private countDirectModules(folderId: string): number {
    return this.getDirectModuleIds(folderId).length;
  }

  private countDirectSubfolders(folderId: string): number {
    return this.getDirectSubfolderIds(folderId).length;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupEdgesByKey(edges: GraphEdge[], key: "from" | "to"): Map<string, GraphEdge[]> {
  const index = new Map<string, GraphEdge[]>();
  for (const edge of edges) {
    const nodeId = edge[key];
    const bucket = index.get(nodeId);
    if (bucket) bucket.push(edge);
    else index.set(nodeId, [edge]);
  }
  return index;
}

interface NodeOpts {
  path?: string;
  parentId?: string;
  priority?: ExplorerNode["priority"];
  edgeCount?: number;
  detail?: Record<string, string | string[]>;
  label?: string;
}

function toExplorerNode(
  id: string,
  type: NodeType,
  description: string,
  opts: NodeOpts = {}
): ExplorerNode {
  // Root node has a special id that shouldn't be split
  const label =
    opts.label ??
    (id === ROOT_FOLDER_NAME
      ? "root"
      : id.includes(".")
        ? id.split(".").pop()!
        : (id.split("/").pop()! ?? id));
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
