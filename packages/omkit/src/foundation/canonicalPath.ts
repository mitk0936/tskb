import fs from "node:fs";

/**
 * The operating system's own name for a file — the spelling every other spelling of it
 * resolves to.
 *
 * Windows filesystems are case-insensitive but case-*preserving*, so `d:\repo\om.ts` and
 * `D:\repo\om.ts` are one file with two names. That is harmless right up until something
 * keys on the string, and omkit keys on it twice:
 *
 * - **Module identity.** Node's ESM loader caches by URL, so `file:///d:/…` and
 *   `file:///D:/…` load the *same file twice* into two module instances with separate
 *   module-level state. An action whose file resolved `"omkit"` one way cannot see the run
 *   started by a host that resolved it the other — the symptom is a bare "no active om() run"
 *   from a run that is demonstrably in progress.
 * - **Run identity.** {@link import("./ids.ts").omHash} hashes the defining file's path, so
 *   the same om launched by two differently-spelled paths writes to two different run
 *   folders — and `logs/<name>-<hash>/` stops meaning "every run of this om".
 *
 * `realpathSync.native` is the OS's answer rather than ours: it fixes drive-letter case, 8.3
 * short names, and symlinked directories in one step. Resolving symlinks is deliberate, not
 * incidental — Node realpaths a module before caching it, so canonicalising the same way is
 * what keeps our identity and Node's agreeing.
 *
 * A path that does not exist yet is returned unchanged: there is no canonical name for a file
 * the filesystem has never seen, and guessing one would be worse than passing it through.
 */
export function canonicalPath(file: string): string {
  try {
    return fs.realpathSync.native(file);
  } catch {
    return file;
  }
}
