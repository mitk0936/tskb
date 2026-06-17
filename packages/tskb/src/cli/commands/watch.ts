import path from "node:path";
import { globSync } from "glob";
import { build, type ExtractConfig } from "./build.js";
import { watchPaths as realWatchPaths, type WatchHandle } from "../utils/watcher.js";
import { info, error } from "../utils/logger.js";

export interface WatchDeps {
  /** Runs one full build. Defaults to the real `build`. Injected in tests. */
  runBuild?: (config: ExtractConfig) => Promise<void>;
  /** Starts watching. Defaults to the real `watchPaths`. Injected in tests. */
  watchPaths?: (
    paths: string[],
    onChange: (changedPath?: string) => void,
    opts?: { debounceMs?: number }
  ) => WatchHandle;
  /** Resolves the directories covered by `config.pattern`. Injected in tests. */
  resolveGlobDirs?: (pattern: string) => string[];
  /**
   * Quiet period (ms) to wait after a build before running a coalesced
   * follow-up rebuild, so trailing/echo fs events settle instead of cascading
   * into back-to-back rebuilds. Defaults to 250.
   */
  settleMs?: number;
}

/** Unique containing directories of the files matched by `pattern`. */
function defaultResolveGlobDirs(pattern: string): string[] {
  const files = globSync(pattern, { absolute: true, nodir: true });
  const dirs = new Set<string>();
  for (const f of files) dirs.add(path.dirname(f));
  return [...dirs];
}

/**
 * Watch mode for `tskb build`. Runs an initial build, then rebuilds on changes
 * to the doc glob's directories plus any `extraPaths`. Stays alive (the fs.watch
 * handles keep the event loop running) until SIGINT.
 */
export async function watch(
  config: ExtractConfig,
  extraPaths: string[],
  deps: WatchDeps = {}
): Promise<void> {
  const runBuild = deps.runBuild ?? build;
  const watchPaths = deps.watchPaths ?? realWatchPaths;
  const resolveGlobDirs = deps.resolveGlobDirs ?? defaultResolveGlobDirs;
  const settleMs = deps.settleMs ?? 250;

  let building = false;
  let dirty = false;

  const rebuild = async (): Promise<void> => {
    if (building) {
      dirty = true;
      return;
    }
    building = true;
    try {
      do {
        dirty = false;
        try {
          await runBuild(config);
        } catch (err) {
          error("❌ Build failed: " + (err instanceof Error ? err.message : String(err)));
        }
        // Debounce between rebuilds: if changes arrived during the build, wait a
        // quiet period before the follow-up so trailing/echo events settle into
        // a single rebuild instead of cascading back-to-back.
        if (dirty && settleMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, settleMs));
        }
      } while (dirty);
    } finally {
      building = false;
    }
  };

  // Initial build (resilient — a failure must not stop watch mode).
  await rebuild();

  const watched = [...resolveGlobDirs(config.pattern), ...extraPaths];
  // `rebuild` returns Promise<void>; the watcher callback's return is ignored at
  // runtime, but returning the promise keeps the run loop awaitable in tests,
  // which inject a fake `watchPaths` that captures this callback.
  const handle = watchPaths(watched, (changedPath) => {
    if (changedPath) {
      const rel = path.relative(process.cwd(), changedPath);
      info("");
      info(`🔄 Change detected: ${rel.startsWith("..") ? changedPath : rel}`);
    }
    return rebuild();
  });

  info("");

  info(`👀 Watching ${watched.length} path(s) for changes. Press Ctrl+C to stop.`);
  for (const p of watched) info(`   └─ ${p}`);

  process.once("SIGINT", () => {
    handle.close();
    info("");
    info("Stopped watching.");
    process.exit(0);
  });
}
