import type { MetaChunk, FolderChunk } from "../graph/chunk-types";
import type { ExplorerNode, ExplorerLink } from "../types";

type Listener = () => void;

/**
 * Pure graph data store — holds loaded chunks only.
 * UI state (expanded set, selected node, search) lives outside this store.
 */
export class GraphStore {
  meta: MetaChunk | null = null;
  folderChunks = new Map<string, FolderChunk>();

  private listeners = new Set<Listener>();

  setMeta(meta: MetaChunk): void {
    this.meta = meta;
    this.notify();
  }

  addFolderChunk(chunk: FolderChunk): void {
    this.folderChunks.set(chunk.folderId, chunk);
    this.notify();
  }

  /** Resolve visible structure nodes given an external expanded set */
  getVisibleStructureNodes(expanded: ReadonlySet<string>): ExplorerNode[] {
    if (!this.meta) return [];

    const nodes: ExplorerNode[] = [this.meta.root];
    this.collectFolderNodes(this.meta.topFolders, expanded, nodes);
    return nodes;
  }

  private collectFolderNodes(
    folders: ExplorerNode[],
    expanded: ReadonlySet<string>,
    out: ExplorerNode[]
  ): void {
    for (const folder of folders) {
      out.push(folder);
      if (!expanded.has(folder.id)) continue;

      const chunk = this.folderChunks.get(folder.id);
      if (!chunk) continue;

      // Sub-folders: recurse
      if (chunk.subfolders?.length) {
        this.collectFolderNodes(chunk.subfolders, expanded, out);
      }

      // Modules and their exports
      for (const mod of chunk.modules) {
        out.push(mod);
        if (!expanded.has(mod.id)) continue;
        out.push(...chunk.exports.filter((e) => e.parentId === mod.id));
      }
    }
  }

  /** Links visible within currently-expanded folders */
  getVisibleLinks(expanded: ReadonlySet<string>): ExplorerLink[] {
    const links: ExplorerLink[] = [];
    for (const [folderId, chunk] of this.folderChunks) {
      if (expanded.has(folderId)) links.push(...chunk.internalEdges);
    }
    return links;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}
