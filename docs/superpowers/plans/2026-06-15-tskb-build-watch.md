# `tskb build --watch` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `--watch` flag to `tskb build` that runs an initial build, then rebuilds the knowledge graph whenever the doc glob or any passed path changes, staying alive until Ctrl+C.

**Architecture:** A reusable debounced multi-path watcher (`watcher.ts`) built on `node:fs.watch` feeds a run loop in a new `watch.ts` command that re-invokes the existing one-shot `build()`. The CLI routes `build` to `watch()` when `--watch` is present. `build()` itself is untouched. No new dependencies.

**Tech Stack:** TypeScript, Node `fs.watch`, `glob` (existing dep), Vitest (repo-root test runner).

---

## File Structure

- **Create** `packages/tskb/src/cli/utils/watcher.ts` — `watchPaths(paths, onChange, opts)`: opens one `fs.watch` per path, debounces/dedupes events, returns `{ close() }`. Knows nothing about builds.
- **Create** `packages/tskb/src/cli/commands/watch.ts` — `watch(config, extraPaths, deps?)`: resolves watched set, runs initial build, wires watcher → run loop (in-flight guard + dirty flag + error resilience), registers SIGINT shutdown. Dependency-injects `runBuild` and `watchPaths` for testability.
- **Modify** `packages/tskb/src/cli/index.ts` — add `watch` option to `parseArgs`; in the `build` case, route to `watch()` when `--watch` has values, else `build()` as today.
- **Modify** `packages/tskb/src/cli/utils/help.ts` — document `--watch` in usage + examples.
- **Create** `tests/unit/watcher.test.ts` — real temp dir + real `fs.watch`, polls for debounced `onChange`.
- **Create** `tests/unit/watch-command.test.ts` — injects fake `watchPaths` + mock `runBuild`; drives the run loop deterministically.

Tests import source via the `.js` extension pointing at `.ts` files (repo convention, e.g. `../../packages/tskb/src/core/explorer/transform.js`). Run all tests with `npm test` (`vitest run`) from the repo root; run a single file with `npx vitest run tests/unit/<file>.test.ts`.

---

## Task 1: Debounced multi-path watcher (`watcher.ts`)

**Files:**

- Create: `packages/tskb/src/cli/utils/watcher.ts`
- Test: `tests/unit/watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/watcher.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { watchPaths } from "../../packages/tskb/src/cli/utils/watcher.js";

/** Poll until `predicate()` is true or timeout elapses. */
async function waitFor(predicate: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("watchPaths", () => {
  const handles: Array<{ close(): void }> = [];
  const dirs: string[] = [];

  afterEach(() => {
    for (const h of handles.splice(0)) h.close();
    for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  });

  function tempDir(): string {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-watch-"));
    dirs.push(d);
    return d;
  }

  it("fires onChange once for a burst of writes (debounced)", async () => {
    const dir = tempDir();
    let calls = 0;
    handles.push(watchPaths([dir], () => calls++, { debounceMs: 50 }));

    const file = path.join(dir, "a.txt");
    for (let i = 0; i < 5; i++) fs.writeFileSync(file, `v${i}`);

    await waitFor(() => calls >= 1);
    // Allow any late events to settle within a couple debounce windows.
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(1);
  });

  it("fires again for a separate later change", async () => {
    const dir = tempDir();
    let calls = 0;
    handles.push(watchPaths([dir], () => calls++, { debounceMs: 50 }));

    fs.writeFileSync(path.join(dir, "a.txt"), "1");
    await waitFor(() => calls === 1);

    fs.writeFileSync(path.join(dir, "b.txt"), "2");
    await waitFor(() => calls === 2);
    expect(calls).toBe(2);
  });

  it("stops firing after close()", async () => {
    const dir = tempDir();
    let calls = 0;
    const handle = watchPaths([dir], () => calls++, { debounceMs: 50 });

    fs.writeFileSync(path.join(dir, "a.txt"), "1");
    await waitFor(() => calls === 1);

    handle.close();
    fs.writeFileSync(path.join(dir, "a.txt"), "2");
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/watcher.test.ts`
Expected: FAIL — cannot resolve `watchPaths` (module/file does not exist).

- [ ] **Step 3: Implement `watcher.ts`**

Create `packages/tskb/src/cli/utils/watcher.ts`:

```ts
import fs from "node:fs";

export interface WatchPathsOptions {
  /** Milliseconds to coalesce a burst of fs events into a single onChange. */
  debounceMs?: number;
}

export interface WatchHandle {
  close(): void;
}

/**
 * Watches one or more paths (files or directories) and calls `onChange` once
 * per debounced burst of filesystem events.
 *
 * Directories are watched recursively. fs.watch emits noisy, duplicated events,
 * so all events across all paths funnel through a single debounce timer.
 */
export function watchPaths(
  paths: string[],
  onChange: () => void,
  opts: WatchPathsOptions = {}
): WatchHandle {
  const debounceMs = opts.debounceMs ?? 250;
  const watchers: fs.FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const schedule = (): void => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!closed) onChange();
    }, debounceMs);
  };

  for (const p of paths) {
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(p, { recursive: true }, () => schedule());
    } catch {
      // Fall back to non-recursive (e.g. watching a single file).
      watcher = fs.watch(p, () => schedule());
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/watcher.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/src/cli/utils/watcher.ts tests/unit/watcher.test.ts
git commit -m "feat(cli): add debounced multi-path watcher util"
```

---

## Task 2: Watch run loop (`watch.ts`)

**Files:**

- Create: `packages/tskb/src/cli/commands/watch.ts`
- Test: `tests/unit/watch-command.test.ts`

The run loop owns: initial build, in-flight coalescing (a change during a build triggers exactly one follow-up rebuild), and error resilience (a build that throws is logged, loop continues). `watch()` takes a `deps` object so tests inject a fake `watchPaths` (captures the `onChange` callback) and a mock `runBuild` — no real filesystem or timers in this test.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/watch-command.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { watch } from "../../packages/tskb/src/cli/commands/watch.js";
import type { ExtractConfig } from "../../packages/tskb/src/cli/commands/build.js";

const config: ExtractConfig = {
  pattern: "docs/**/*.tskb.tsx",
  tsconfig: "tsconfig.json",
  projectName: "Test",
};

/** A promise whose resolve is exposed, so the test controls when a build finishes. */
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("watch run loop", () => {
  it("runs an initial build and starts watching the glob + extra paths", async () => {
    const runBuild = vi.fn().mockResolvedValue(undefined);
    let watched: string[] = [];
    const fakeWatch = vi.fn((paths: string[]) => {
      watched = paths;
      return { close: () => {} };
    });

    await watch(config, ["./src", "./packages/foo"], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
    });

    expect(runBuild).toHaveBeenCalledTimes(1);
    expect(fakeWatch).toHaveBeenCalledTimes(1);
    expect(watched).toEqual(["docs", "./src", "./packages/foo"]);
  });

  it("rebuilds on a change event", async () => {
    const runBuild = vi.fn().mockResolvedValue(undefined);
    // `watch.ts` passes the run-loop `rebuild` (returns a Promise) as the
    // watcher callback. The param is typed `() => void`, but at runtime it
    // returns the rebuild promise, so awaiting `onChange()` waits for the
    // full rebuild. That makes these tests deterministic — no timer guessing.
    let onChange: () => void = () => {};
    const fakeWatch = vi.fn((_paths: string[], cb: () => void) => {
      onChange = cb;
      return { close: () => {} };
    });

    await watch(config, [], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
    });
    expect(runBuild).toHaveBeenCalledTimes(1); // initial

    await onChange();
    expect(runBuild).toHaveBeenCalledTimes(2);
  });

  it("coalesces changes that arrive while a build is in flight", async () => {
    const first = deferred();
    const runBuild = vi
      .fn()
      .mockReturnValueOnce(Promise.resolve()) // initial build
      .mockReturnValueOnce(first.promise) // in-flight build
      .mockResolvedValue(undefined); // coalesced follow-up
    let onChange: () => void = () => {};
    const fakeWatch = vi.fn((_p: string[], cb: () => void) => {
      onChange = cb;
      return { close: () => {} };
    });

    await watch(config, [], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
    });
    expect(runBuild).toHaveBeenCalledTimes(1); // initial done

    const p2 = onChange(); // starts build #2 (the rebuild loop, stays pending)
    onChange(); // arrives during build #2 → sets dirty
    onChange(); // also during build #2 → stays one follow-up

    first.resolve(); // build #2 completes → exactly one follow-up build runs
    await p2; // the rebuild loop runs the single coalesced follow-up, then resolves

    expect(runBuild).toHaveBeenCalledTimes(3); // initial + #2 + one coalesced follow-up
  });

  it("keeps running when a build throws", async () => {
    const runBuild = vi
      .fn()
      .mockResolvedValueOnce(undefined) // initial ok
      .mockRejectedValueOnce(new Error("boom")) // change #1 fails
      .mockResolvedValue(undefined); // change #2 ok
    let onChange: () => void = () => {};
    const fakeWatch = vi.fn((_p: string[], cb: () => void) => {
      onChange = cb;
      return { close: () => {} };
    });

    await watch(config, [], {
      runBuild,
      watchPaths: fakeWatch,
      resolveGlobDirs: () => ["docs"],
    });

    await onChange(); // build throws internally, is caught, must not reject
    await onChange(); // loop still responds
    expect(runBuild).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/watch-command.test.ts`
Expected: FAIL — cannot resolve `watch` (file does not exist).

- [ ] **Step 3: Implement `watch.ts`**

Create `packages/tskb/src/cli/commands/watch.ts`:

```ts
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
    onChange: () => void,
    opts?: { debounceMs?: number }
  ) => WatchHandle;
  /** Resolves the directories covered by `config.pattern`. Injected in tests. */
  resolveGlobDirs?: (pattern: string) => string[];
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
      } while (dirty);
    } finally {
      building = false;
    }
  };

  // Initial build (resilient — a failure must not stop watch mode).
  await rebuild();

  const watched = [...resolveGlobDirs(config.pattern), ...extraPaths];
  // `rebuild` returns Promise<void>; the watcher's callback type is `() => void`
  // (the returned promise is ignored at runtime). This keeps the run loop
  // awaitable in tests, which inject a fake `watchPaths` that captures `rebuild`.
  const handle = watchPaths(watched, rebuild);

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/watch-command.test.ts`
Expected: PASS — all four tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/src/cli/commands/watch.ts tests/unit/watch-command.test.ts
git commit -m "feat(cli): add watch run loop with coalescing and error resilience"
```

---

## Task 3: Wire `--watch` into the CLI

**Files:**

- Modify: `packages/tskb/src/cli/index.ts:24-42` (parseArgs options) and `:53-66` (build case)

- [ ] **Step 1: Add the `watch` option to parseArgs**

In `packages/tskb/src/cli/index.ts`, inside the `options` object (after the `export` option on line 39), add:

```ts
      export: { type: "string" },
      // build watch mode
      watch: { type: "string", multiple: true },
```

- [ ] **Step 2: Route the build case to watch mode when `--watch` is present**

Replace the body of the `case "build": { ... }` block (lines 53-66) with:

```ts
      case "build": {
        const pattern = resolvedCommand === command ? positionals[1] : command;
        if (!pattern) {
          error("Error: build command requires a glob pattern");
          process.exit(1);
        }
        if (!values.project) {
          error("Error: build command requires --project <name>");
          process.exit(1);
        }
        const config = { pattern, tsconfig: values.tsconfig!, projectName: values.project };
        if (values.watch && values.watch.length > 0) {
          const { watch } = await import("./commands/watch.js");
          await watch(config, values.watch);
        } else {
          const { build } = await import("./commands/build.js");
          await build(config);
        }
        break;
      }
```

- [ ] **Step 3: Verify a one-shot build still works (no `--watch`)**

Run from `packages/tskb/`: `npm run build:lib`
Then from the repo root: `npx tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo"`
Expected: build runs once, prints `✓ Done!`, and the process **exits** (no watching).

- [ ] **Step 4: Verify watch mode starts and rebuilds**

Run from the repo root:
`npx tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json --project "TSKB Monorepo" --watch ./packages/tskb/src`
Expected: initial build prints `✓ Done!`, then `👀 Watching N path(s)…` and the process **stays alive**. Touch any `.tskb.tsx` doc (save it) and confirm a rebuild logs and completes. Press Ctrl+C → prints `Stopped watching.` and exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/src/cli/index.ts
git commit -m "feat(cli): route 'build --watch' to watch mode"
```

---

## Task 4: Document `--watch` in help text

**Files:**

- Modify: `packages/tskb/src/cli/utils/help.ts:7` (usage line) and `:25` (build example)

- [ ] **Step 1: Update the build usage line**

In `getHelpText()`, replace the build usage line (line 7):

```ts
  tskb build <glob> [--tsconfig <path>] [--verbose]
```

with:

```ts
  tskb build <glob> [--tsconfig <path>] [--watch <path>]... [--verbose]
```

- [ ] **Step 2: Add a watch example**

Immediately after the existing build example line (the `tskb build "src/**/*.tsx" --tsconfig ./tsconfig.json` line, line 25), add:

```ts
  tskb build "src/**/*.tsx" --watch ./src                 # Rebuild on changes to docs + ./src (Ctrl+C to stop)
```

- [ ] **Step 3: Verify help renders**

Run from the repo root: `npx tskb`
Expected: help text prints and includes the `--watch` usage and example lines.

- [ ] **Step 4: Commit**

```bash
git add packages/tskb/src/cli/utils/help.ts
git commit -m "docs(cli): document build --watch in help text"
```

---

## Task 5: Full test + lint pass

- [ ] **Step 1: Run the full test suite**

Run from the repo root: `npm test`
Expected: PASS — all existing tests plus the two new unit files green.

- [ ] **Step 2: Lint**

Run from the repo root: `npm run lint`
Expected: no errors in the new/changed files.

- [ ] **Step 3: Commit any lint fixes (if needed)**

```bash
git add -A
git commit -m "chore: lint fixes for build --watch"
```

---

## Notes for the implementer

- **Do not modify `build.ts`.** Watch mode reuses it as-is. If you feel the urge to make it incremental, stop — that was explicitly deferred (see the design doc's "Out of scope").
- **stdout stays clean.** All watch logging goes through `info`/`error`, which write to **stderr** (see `logger.ts`). Don't `console.log` from watch code.
- **`fs.watch` recursive** is supported on Windows/macOS and Linux (Node ≥ 20). The `watcher.ts` fallback handles the single-file case.
- The design doc for this feature is `docs/superpowers/specs/2026-06-15-tskb-build-watch-design.md`.
