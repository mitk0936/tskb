import { chunkUrl, type ChunkKind, type ChunkRegistry } from "./chunk-types";

// ─── LRU Cache ───────────────────────────────────────────────────────────────

class LRUCache<K, V> {
  private map = new Map<K, V>();

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const val = this.map.get(key);
    if (val !== undefined) {
      // Re-insert to mark as most recently used
      this.map.delete(key);
      this.map.set(key, val);
    }
    return val;
  }

  set(key: K, val: V): void {
    this.map.delete(key);
    this.map.set(key, val);
    if (this.map.size > this.maxSize) {
      // Evict least recently used (first entry)
      const oldest = this.map.keys().next().value as K;
      this.map.delete(oldest);
    }
  }

  has(key: K): boolean {
    return this.map.has(key);
  }
}

// ─── Type helpers ─────────────────────────────────────────────────────────────

type ChunkArgs<K extends ChunkKind> = K extends "folder" ? [folderId: string] : [];

type AnyChunk = ChunkRegistry[ChunkKind];

// ─── ChunkLoader ─────────────────────────────────────────────────────────────

/**
 * Type-safe, LRU-cached chunk loader.
 *
 * Usage:
 *   const meta = await loader.load('meta');
 *   const chunk = await loader.load('folder', folderId);
 *
 * Adding a new chunk kind: update ChunkRegistry + ChunkKind in chunk-types.ts only.
 */
export class ChunkLoader {
  private cache = new LRUCache<string, AnyChunk>(50);
  private inflight = new Map<string, Promise<AnyChunk>>();

  async load<K extends ChunkKind>(kind: K, ...args: ChunkArgs<K>): Promise<ChunkRegistry[K]> {
    const url =
      kind === "folder" ? chunkUrl("folder", (args as [string])[0]) : chunkUrl(kind as "meta");

    const cached = this.cache.get(url);
    if (cached) return cached as ChunkRegistry[K];

    const existing = this.inflight.get(url);
    if (existing) return existing as Promise<ChunkRegistry[K]>;

    const promise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Chunk fetch failed: ${url} (${r.status})`);
        return r.json() as Promise<ChunkRegistry[K]>;
      })
      .then((data) => {
        this.cache.set(url, data as AnyChunk);
        this.inflight.delete(url);
        return data;
      })
      .catch((err) => {
        this.inflight.delete(url);
        throw err;
      });

    this.inflight.set(url, promise as Promise<AnyChunk>);
    return promise;
  }

  /** Remove in-flight tracking (does not abort the request) */
  cancel(kind: ChunkKind, ...args: string[]): void {
    const url = kind === "folder" ? chunkUrl("folder", args[0]) : chunkUrl(kind as "meta");
    this.inflight.delete(url);
  }
}
