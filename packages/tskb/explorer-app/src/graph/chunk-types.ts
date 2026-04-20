import type { ExplorerNode, ExplorerLink } from "../types";

// ─── Chunk shapes ────────────────────────────────────────────────────────────

export interface MetaChunk {
  kind: "meta";
  metadata: {
    generatedAt: string;
    version: string;
    rootPath: string;
    stats: Record<string, number>;
  };
  /** The __TSKB.ROOT__ folder node */
  root: ExplorerNode;
  /** Direct children of root (top-level folders) */
  topFolders: ExplorerNode[];
  docs: ExplorerNode[];
  flows: ExplorerNode[];
  terms: ExplorerNode[];
  externals: ExplorerNode[];
  /** Edges from doc/flow nodes referencing code nodes (cross-lane) */
  crossEdges: ExplorerLink[];
  /** node-id → parent-id for every declared node; used to resolve nearest visible ancestor */
  parentOf: Record<string, string>;
  /** IDs of all folder nodes (declared + ghost intermediaries); used to decide which ancestors need chunk loading */
  folderIds: string[];
}

export interface FolderChunk {
  kind: "folder";
  folderId: string;
  /** Direct sub-folders (for folders that contain other folders, not modules) */
  subfolders: ExplorerNode[];
  modules: ExplorerNode[];
  exports: ExplorerNode[];
  /** Import edges between modules within this folder */
  internalEdges: ExplorerLink[];
  /** Import edges from/to modules outside this folder */
  externalEdges: ExplorerLink[];
}

// ─── Registry & helpers ──────────────────────────────────────────────────────

export interface ChunkRegistry {
  meta: MetaChunk;
  folder: FolderChunk;
}

export type ChunkKind = keyof ChunkRegistry;

// Overloads for the URL builder — strongly typed per kind
export function chunkUrl(kind: "meta"): string;
export function chunkUrl(kind: "folder", folderId: string): string;
export function chunkUrl(kind: ChunkKind, ...args: string[]): string {
  if (kind === "folder") return `./chunks/folder-${sanitizeId(args[0])}.json`;
  return `./chunks/${kind}.json`;
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-z0-9.\-]/gi, "_");
}
