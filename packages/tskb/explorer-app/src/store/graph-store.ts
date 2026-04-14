import type { MetaChunk, FolderChunk } from "../graph/chunk-types";

type Listener = () => void;

/**
 * Pure graph data store — holds loaded chunks only.
 * UI state (expanded set, selected node, search) lives outside this store.
 */
export class GraphStore {
  meta: MetaChunk | null = null;
  folderChunks = new Map<string, FolderChunk>();

  private listeners = new Set<Listener>();

  loadMeta(meta: MetaChunk): void {
    this.meta = meta;
    this.notifyListeners();
  }

  loadFolderChunk(chunk: FolderChunk): void {
    this.folderChunks.set(chunk.folderId, chunk);
    this.notifyListeners();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((l) => l());
  }
}
