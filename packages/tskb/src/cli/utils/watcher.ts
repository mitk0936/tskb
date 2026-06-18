import fs from "node:fs";
import path from "node:path";

export interface WatchPathsOptions {
  /** Milliseconds to coalesce a burst of fs events into a single onChange. */
  debounceMs?: number;
}

export interface WatchHandle {
  close(): void;
}

/**
 * Watches one or more paths (files or directories) and calls `onChange` once
 * per debounced burst of filesystem events. `onChange` receives the path of the
 * most recent change in the burst (best-effort — fs.watch does not always report
 * a filename, in which case the watched root is reported instead).
 *
 * Directories are watched recursively. fs.watch emits noisy, duplicated events,
 * so all events across all paths funnel through a single debounce timer.
 */
export function watchPaths(
  paths: string[],
  onChange: (changedPath?: string) => void,
  opts: WatchPathsOptions = {}
): WatchHandle {
  const debounceMs = opts.debounceMs ?? 250;
  const watchers: fs.FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastChanged: string | undefined;
  let closed = false;

  const schedule = (changed?: string): void => {
    if (closed) return;
    if (changed) lastChanged = changed;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const changedPath = lastChanged;
      lastChanged = undefined;
      if (!closed) onChange(changedPath);
    }, debounceMs);
  };

  for (const p of paths) {
    // Watch the canonical path. On Windows, recursive fs.watch asserts inside
    // libuv (!_wcsnicmp) when the supplied path's casing/junction differs from
    // what the OS reports for change events (e.g. paths under os.tmpdir()).
    // Resolving the real path keeps libuv's prefix comparison consistent.
    let target = p;
    try {
      target = fs.realpathSync.native(p);
    } catch {
      // Path may not exist yet (or realpath unsupported); fall back to as-given.
    }

    const resolveChanged = (filename: string | Buffer | null): string =>
      filename ? path.join(target, filename.toString()) : target;

    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(target, { recursive: true }, (_evt, filename) =>
        schedule(resolveChanged(filename))
      );
    } catch {
      // Fall back to non-recursive (e.g. watching a single file).
      watcher = fs.watch(target, (_evt, filename) => schedule(resolveChanged(filename)));
    }
    watcher.on("error", () => {
      // A watch handle failing must not crash the process.
    });
    watchers.push(watcher);
  }

  return {
    close(): void {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      for (const w of watchers) w.close();
    },
  };
}
