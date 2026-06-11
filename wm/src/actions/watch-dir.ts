import { existsSync, watch as fsWatch, type FSWatcher, type WatchEventType } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { action } from "../../core/action.ts";

export interface WatchDirOptions {
  /** Coalesce rapid events within this window. Default 50ms. */
  debounceMs?: number;
}

/**
 * Events emitted by {@link watchDir}. Each payload is the absolute path of the
 * entry — a file for create/update/delete, the folder itself for ready/removed.
 */
export interface WatchDirEvents {
  /** A file appeared during the run. */
  create: string;
  /** A file's contents changed (its mtime moved). */
  update: string;
  /** A file was removed. */
  delete: string;
  /** The folder appeared (or existed at startup); fires again on recreation. */
  ready: string;
  /** The folder was removed (paired with `ready` when it's replaced). */
  removed: string;
}

/**
 * Watches a directory and emits per-file events on changes, surviving the folder
 * being deleted and recreated (e.g. a build that `rm -rf`s it first).
 *
 * It watches the existing ancestor chain (target recursively, ancestors
 * non-recursively) so a stable ancestor keeps firing when the target reappears.
 * Per-file changes are derived by re-`stat`ing and diffing mtimes.
 *
 * The folder's own removal/recreation can't be seen by stat: a wipe+recreate is
 * atomic (never observed absent), and on NTFS the recreated dir even keeps the
 * old `ino`/`birthtime` (tunneling). So that's detected from the raw `rename`
 * event the *parent* fires for the target's name — when it does and the target
 * still exists, it was replaced (`removed` + `ready`).
 */
export const watchDir = action("Watch Dir")
  .emits<WatchDirEvents>()
  .run(({ signal, emit }, target: string, opts: WatchDirOptions = {}) => {
    const { debounceMs = 50 } = opts;
    const root = resolve(target);
    const targetName = basename(root);
    const targetParent = dirname(root);

    let seen = new Map<string, number>(); // abs path -> mtimeMs
    let rootPresent = false; // believed existence of the folder itself
    let churned = false; // the parent reported a rename for the target since last tick

    const scan = async (): Promise<Map<string, number>> => {
      const next = new Map<string, number>();
      let entries: string[];
      try {
        entries = await readdir(root, { recursive: true });
      } catch {
        return next; // target missing/unreadable -> empty snapshot
      }
      for (const rel of entries) {
        const abs = join(root, rel);
        try {
          const stats = await stat(abs);
          if (stats.isFile()) next.set(abs, stats.mtimeMs);
        } catch {
          // entry vanished between readdir and stat — skip
        }
      }
      return next;
    };

    const recheck = async (isInitial: boolean): Promise<void> => {
      const next = await scan();
      // Startup seeds the snapshot silently — so onCreate means "created during
      // this run", not "already there when we started" (last run's leftovers).
      if (!isInitial) {
        for (const [path, mtime] of next) {
          const prev = seen.get(path);
          if (prev === undefined) emit("create", path);
          else if (prev !== mtime) emit("update", path);
        }
        for (const path of seen.keys()) {
          if (!next.has(path)) emit("delete", path);
        }
      }
      seen = next;
    };

    // Derive the folder's own create/remove/recreate from existence + the churn
    // signal (a parent `rename` for the target's name).
    const detectDir = (isInitial: boolean, didChurn: boolean): void => {
      const present = existsSync(root);
      if (isInitial) {
        rootPresent = present;
        if (present) emit("ready", root);
        return;
      }
      if (didChurn) {
        if (rootPresent) emit("removed", root); // replaced or removed
        if (present) emit("ready", root); // created or recreated
      } else if (present !== rootPresent) {
        emit(present ? "ready" : "removed", root);
      }
      rootPresent = present;
    };

    const existingChain = (): string[] => {
      const chain: string[] = [];
      for (let dir = root; ; dir = dirname(dir)) {
        if (existsSync(dir)) chain.push(dir);
        if (dirname(dir) === dir) break;
      }
      return chain;
    };

    const watchers: FSWatcher[] = [];
    let armed: string[] = [];

    const onEvent =
      (dir: string) =>
      (eventType: WatchEventType, filename: string | null): void => {
        // A rename of the target's own name, seen from its parent = the folder
        // was created / removed / replaced.
        if (dir === targetParent && filename === targetName && eventType === "rename") {
          churned = true;
        }
        schedule();
      };

    const arm = (force: boolean): void => {
      const chain = existingChain();
      const same = chain.length === armed.length && chain.every((d, i) => d === armed[i]);
      if (same && !force) return; // re-arm only when structure changed (or forced after a churn)

      for (const w of watchers) w.close();
      watchers.length = 0;
      for (const dir of chain) {
        try {
          watchers.push(fsWatch(dir, { recursive: dir === root }, onEvent(dir)));
        } catch {
          // some ancestors may be unwatchable — ignore
        }
      }
      armed = chain;
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void tick(false), debounceMs);
    };

    const tick = async (isInitial: boolean): Promise<void> => {
      const didChurn = churned;
      churned = false;
      arm(didChurn); // re-arm (force after a churn — the old target handle is dead)
      detectDir(isInitial, didChurn);
      await recheck(isInitial);
    };

    void tick(true); // initial state + arm the chain

    // Daemon: stay alive until torn down, then flush once more and close.
    return new Promise<void>((resolveRun) => {
      const stop = async (): Promise<void> => {
        if (timer) clearTimeout(timer);
        await tick(false); // final flush — capture changes right before teardown
        for (const w of watchers) w.close();
        watchers.length = 0;
        resolveRun();
      };
      if (signal.aborted) void stop();
      else signal.addEventListener("abort", () => void stop(), { once: true });
    });
  });
