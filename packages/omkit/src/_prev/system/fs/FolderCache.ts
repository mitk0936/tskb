import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

/** What a single cache entry stores on disk. */
interface CacheEntry {
  /** The absolute input paths this entry fingerprints. */
  folders: string[];
  /** The fingerprint captured at the last successful run. */
  fingerprint: string;
  /** When it was written (epoch ms) — for inspection/debugging. */
  ts: number;
}

/**
 * An input-fingerprint cache: hash the mtime+size of one or more **input**
 * targets (the files/folders an action reads — *not* what it produces), so an
 * expensive action can be skipped when its inputs are unchanged since its last
 * successful run. Backs the `.withCache(...)` method on action instances.
 *
 * Entries live under `node_modules/.cache/omkit/` (conventional, gitignored) —
 * one JSON file per set of inputs, named by a hash of their absolute paths.
 *
 * Stateless — the cache is the filesystem, so the methods are `static`. Internal
 * cross-references go through the class name (not `this`), so a caller may pull a
 * method off the class (`const fp = FolderCache.fingerprint`) without losing it.
 */
export class FolderCache {
  /** Where cache entries are written — `node_modules/.cache/omkit/` under the cwd. */
  static readonly dir = join(process.cwd(), "node_modules", ".cache", "omkit");

  /**
   * Require every path to be **absolute** (a relative path is a developer error —
   * throws, naming it) and return them canonicalized with `resolve`, so different
   * spellings of the same target (`.`/`..`/trailing slash) collapse to one stable
   * fingerprint prefix and cache key. `resolve` on an already-absolute path only
   * normalizes — it never falls back to the cwd. Each target may be a file or a
   * folder (see {@link FolderCache.fingerprint}).
   */
  static resolvePaths(paths: string[]): string[] {
    return paths.map((p) => {
      if (!isAbsolute(p)) {
        throw new Error(`withCache: path must be absolute, got "${p}"`);
      }
      return resolve(p);
    });
  }

  /**
   * Fingerprints one or more **input** targets by mtime+size. Each target may be
   * a **file** (fingerprinted directly) or a **folder** (walked recursively, its
   * files fingerprinted). Every path must be absolute (throws otherwise). A
   * missing target contributes nothing — so an input that doesn't exist yet is
   * naturally a miss, not an error. The entry list is sorted for determinism
   * before hashing.
   */
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

      // A file target fingerprints itself (empty rel — there's no walk).
      if (root.isFile()) {
        record(target, "", root.mtimeMs, root.size);
        continue;
      }

      // A folder target: walk it and fingerprint every file inside.
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

  /**
   * Reads the fingerprint stored for these targets, or `undefined` when there's
   * no cache (absent, unreadable, or malformed — all treated as a miss).
   */
  static async read(paths: string[]): Promise<string | undefined> {
    try {
      const raw = await readFile(FolderCache.entryPath(paths), "utf8");
      const entry = JSON.parse(raw) as CacheEntry;
      return typeof entry.fingerprint === "string" ? entry.fingerprint : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Records the fingerprint for these targets after a successful run. Writes
   * atomically (temp file + rename) so a concurrent read never sees a half-file.
   */
  static async write(paths: string[], fp: string): Promise<void> {
    await mkdir(FolderCache.dir, { recursive: true });
    const target = FolderCache.entryPath(paths);
    const entry: CacheEntry = { folders: paths, fingerprint: fp, ts: Date.now() };
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(entry, null, 2));
    await rename(tmp, target);
  }

  /** The on-disk filename for a set of targets — a hash of their absolute paths. */
  private static entryPath(paths: string[]): string {
    const key = createHash("sha1")
      .update(FolderCache.resolvePaths(paths).sort().join("\0"))
      .digest("hex");
    return join(FolderCache.dir, `${key}.json`);
  }
}
