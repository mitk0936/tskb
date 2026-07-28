import { watch as fsWatch, type Stats } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { action } from "../core/action.ts";

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
  onMissing?: FileListener;
  onCreate?: FileListener;
  onUpdate?: FileListener;
  onDelete?: FileListener;
  /** Coalesce rapid events (e.g. an editor's atomic save) within this window. Default 50ms. */
  debounceMs?: number;
}

/**
 * Watches a single file that may not exist yet, firing callbacks on its
 * transitions. Watches the parent directory and filters by name (so a missing
 * file can be awaited), re-`stat`ing on each event to diff against last state.
 * Daemon: runs until the run's signal aborts, then closes the watcher.
 */
export const watch = action("watch").run(({ signal }, target: string, opts: WatchOptions = {}) => {
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
        console.log(`created ${file}`);
        onCreate?.({ path: file, isInitial, stats });
      } else if (stats.mtimeMs !== mtimeMs) {
        mtimeMs = stats.mtimeMs;
        console.log(`updated ${file}`);
        onUpdate?.({ path: file, isInitial, stats });
      }
    } else if (present) {
      present = false;
      mtimeMs = 0;
      console.log(`deleted ${file}`);
      onDelete?.({ path: file, isInitial });
    } else if (isInitial) {
      console.log(`missing ${file}`);
      onMissing?.({ path: file, isInitial });
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void recheck(false), debounceMs);
  };

  const watcher = fsWatch(dir, (_event, filename) => {
    if (filename === null || filename === name) schedule();
  });

  void recheck(true); // report the initial state

  return new Promise<void>((resolveRun) => {
    const stop = (): void => {
      if (timer) clearTimeout(timer);
      watcher.close();
      resolveRun();
    };
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
});
