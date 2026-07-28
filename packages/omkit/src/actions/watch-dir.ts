import { existsSync, watch as fsWatch, type FSWatcher, type WatchEventType } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { action } from "../core/action.ts";

export interface WatchDirOptions {
  /** Coalesce rapid events within this window. Default 50ms. */
  debounceMs?: number;
}

/** Events emitted by {@link watchDir}. Each payload is the absolute path of the entry. */
export interface WatchDirEvents {
  create: string;
  update: string;
  delete: string;
  /** The folder appeared (or existed at startup); fires again on recreation. */
  ready: string;
  /** The folder was removed (paired with `ready` when it's replaced). */
  removed: string;
}

/**
 * Watches a directory and emits per-file events, surviving the folder being
 * deleted and recreated (e.g. a build that `rm -rf`s it first). Watches the
 * existing ancestor chain so a stable ancestor keeps firing when the target
 * reappears; per-file changes are derived by re-`stat`ing and diffing mtimes.
 */
export const watchDir = action("watchDir")
  .emits<WatchDirEvents>()
  .run(({ signal, emit }, target: string, opts: WatchDirOptions = {}) => {
    const { debounceMs = 50 } = opts;
    const root = resolve(target);
    const targetName = basename(root);
    const targetParent = dirname(root);

    let seen = new Map<string, number>(); // abs path -> mtimeMs
    let rootPresent = false;
    let churned = false;

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

    const detectDir = (isInitial: boolean, didChurn: boolean): void => {
      const present = existsSync(root);
      if (isInitial) {
        rootPresent = present;
        if (present) emit("ready", root);
        return;
      }
      if (didChurn) {
        if (rootPresent) emit("removed", root);
        if (present) emit("ready", root);
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
        if (dir === targetParent && filename === targetName && eventType === "rename") {
          churned = true;
        }
        schedule();
      };

    const arm = (force: boolean): void => {
      const chain = existingChain();
      const same = chain.length === armed.length && chain.every((d, i) => d === armed[i]);
      if (same && !force) return;

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
      arm(didChurn);
      detectDir(isInitial, didChurn);
      await recheck(isInitial);
    };

    void tick(true); // initial state + arm the chain

    return new Promise<void>((resolveRun) => {
      const stop = async (): Promise<void> => {
        if (timer) clearTimeout(timer);
        await tick(false); // final flush before teardown
        for (const w of watchers) w.close();
        watchers.length = 0;
        resolveRun();
      };
      if (signal.aborted) void stop();
      else signal.addEventListener("abort", () => void stop(), { once: true });
    });
  });
