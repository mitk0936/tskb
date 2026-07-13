import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

/** What a single cache entry stores on disk. */
interface CacheEntry {
  folders: string[];
  fingerprint: string;
  ts: number;
}

/**
 * An input-fingerprint cache: hash the mtime+size of one or more **input**
 * targets (the files/folders an action reads — *not* what it produces), so an
 * expensive action can be skipped when its inputs are unchanged since its last
 * successful run. Backs `.withCache(...)` on action instances. Entries live under
 * `node_modules/.cache/omkit/`. Stateless — the cache is the filesystem.
 */
export class FolderCache {
  static readonly dir = join(process.cwd(), "node_modules", ".cache", "omkit");

  /** Require absolute paths (throws otherwise) and canonicalize them for a stable key. */
  static resolvePaths(paths: string[]): string[] {
    return paths.map((p) => {
      if (!isAbsolute(p)) throw new Error(`withCache: path must be absolute, got "${p}"`);
      return resolve(p);
    });
  }

  /** Fingerprint input targets by mtime+size (files directly, folders walked). Missing = no entries. */
  static async fingerprint(paths: string[]): Promise<string> {
    const targets = FolderCache.resolvePaths(paths);
    const entries: string[] = [];
    const record = (target: string, rel: string, mtimeMs: number, size: number): void => {
      entries.push(`${target}\0${rel}\0${mtimeMs}\0${size}`);
    };

    for (const target of targets) {
      let root: Awaited<ReturnType<typeof stat>>;
      try {
        root = await stat(target);
      } catch {
        continue; // missing/unreadable — contributes no entries
      }
      if (root.isFile()) {
        record(target, "", root.mtimeMs, root.size);
        continue;
      }
      let rels: string[];
      try {
        rels = await readdir(target, { recursive: true });
      } catch {
        continue;
      }
      for (const rel of rels) {
        const abs = join(target, rel);
        try {
          const stats = await stat(abs);
          if (stats.isFile()) record(target, rel, stats.mtimeMs, stats.size);
        } catch {
          // entry vanished between readdir and stat — skip
        }
      }
    }

    entries.sort();
    return createHash("sha1").update(entries.join("\n")).digest("hex");
  }

  /** The stored fingerprint for these targets, or `undefined` on any miss. */
  static async read(paths: string[]): Promise<string | undefined> {
    try {
      const raw = await readFile(FolderCache.entryPath(paths), "utf8");
      const entry = JSON.parse(raw) as CacheEntry;
      return typeof entry.fingerprint === "string" ? entry.fingerprint : undefined;
    } catch {
      return undefined;
    }
  }

  /** Record the fingerprint after a successful run (atomic temp+rename). */
  static async write(paths: string[], fp: string): Promise<void> {
    await mkdir(FolderCache.dir, { recursive: true });
    const target = FolderCache.entryPath(paths);
    const entry: CacheEntry = { folders: paths, fingerprint: fp, ts: Date.now() };
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(entry, null, 2));
    await rename(tmp, target);
  }

  private static entryPath(paths: string[]): string {
    const key = createHash("sha1")
      .update(FolderCache.resolvePaths(paths).sort().join("\0"))
      .digest("hex");
    return join(FolderCache.dir, `${key}.json`);
  }
}
