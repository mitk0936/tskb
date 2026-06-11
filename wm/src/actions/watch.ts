import { watch as fsWatch, type Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { action } from "../../core/action.ts";

export interface FileEvent {
  /** Absolute path of the watched file. */
  path: string;
  /** True for the state reported at startup; false for a live transition. */
  isInitial: boolean;
  /** Stats when the file exists (create/update); absent for delete/missing. */
  stats?: Stats;
}

export type FileListener = (event: FileEvent) => void;

export interface WatchOptions {
  /** The file is absent when watching starts. */
  onMissing?: FileListener;
  /** The file appeared (or already existed at startup — `isInitial`). */
  onCreate?: FileListener;
  /** The file's contents changed (its mtime moved). */
  onUpdate?: FileListener;
  /** The file was removed. */
  onDelete?: FileListener;
  /** Coalesce rapid events (e.g. an editor's atomic save) within this window. Default 50ms. */
  debounceMs?: number;
}

/**
 * Watches a single file that may not exist yet, firing callbacks on its
 * transitions. Since `fs.watch` can't watch a missing path, it watches the
 * parent directory and filters by name; on each event it re-`stat`s and diffs
 * against the last known state rather than trusting the raw event type. Runs
 * until the run's signal aborts, then closes the watcher.
 *
 * Assumes the parent directory exists; watching when an ancestor is missing is
 * a later case.
 */
export const watch = action(
  "Watch",
  ({ logs, signal }, target: string, opts: WatchOptions = {}) => {
    const { onMissing, onCreate, onUpdate, onDelete, debounceMs = 50 } = opts;

    const file = resolve(target);
    const dir = dirname(file);
    const name = basename(file);

    let present = false;
    let mtimeMs = 0;

    const recheck = async (isInitial: boolean): Promise<void> => {
      let stats: Stats | undefined;
      try {
        stats = await stat(file);
      } catch {
        stats = undefined; // ENOENT (or unreadable) → treat as absent
      }

      if (stats?.isFile()) {
        if (!present) {
          present = true;
          mtimeMs = stats.mtimeMs;
          logs.append({ source: name, level: "info", message: `created ${file}` });
          onCreate?.({ path: file, isInitial, stats });
        } else if (stats.mtimeMs !== mtimeMs) {
          mtimeMs = stats.mtimeMs;
          logs.append({ source: name, level: "info", message: `updated ${file}` });
          onUpdate?.({ path: file, isInitial, stats });
        }
      } else if (present) {
        present = false;
        mtimeMs = 0;
        logs.append({ source: name, level: "info", message: `deleted ${file}` });
        onDelete?.({ path: file, isInitial });
      } else if (isInitial) {
        logs.append({ source: name, level: "info", message: `missing ${file}` });
        onMissing?.({ path: file, isInitial });
      }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void recheck(false), debounceMs);
    };

    // Watch the parent dir (the file may not exist yet) and filter by name.
    // Some platforms pass a null filename — recheck anyway, it's a cheap stat.
    const watcher = fsWatch(dir, (_event, filename) => {
      if (filename === null || filename === name) schedule();
    });

    void recheck(true); // report the initial state

    // Daemon: stay alive until torn down, then close the watcher.
    return new Promise<void>((resolveRun) => {
      const stop = (): void => {
        if (timer) clearTimeout(timer);
        watcher.close();
        resolveRun();
      };
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    });
  }
);
