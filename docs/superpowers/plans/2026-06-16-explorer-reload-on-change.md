# Explorer Reload-on-Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While `tskb explore` is running, detect when the graph is rebuilt and prompt the open page to reload.

**Architecture:** The graph writer writes files atomically with `meta.json` written last, so its mtime is a reliable "new graph ready" signal. The explore server watches `.tskb/graph/`, reloads + rebuilds its chunk cache on change, stamps the served meta chunk with `mode: "served"` + a `version` (meta.json mtime), and exposes `GET /version`. The SPA reads `meta.mode`; when `"served"` it polls `/version` and shows a persistent reload dialog when the version changes. The static export stamps `mode: "static"` and never polls.

**Tech Stack:** TypeScript, Node built-in `http`/`fs`, Vitest (unit in `tests/unit/`, E2E in `tests/e2e/` against the built CLI).

---

## File Structure

- `packages/tskb/src/core/graph/writer.ts` — add `writeAtomic`; reorder meta.json last. (modify)
- `packages/tskb/src/cli/utils/graph-loader.ts` — export `findGraphDir`. (modify)
- `packages/tskb/src/core/explorer/transform.ts` — add `mode`/`version` to `MetaChunk`. (modify)
- `packages/tskb/src/core/explorer/server.ts` — `buildChunkCache`, stamp meta, `/version` route, graph watching, DI. (modify)
- `packages/tskb/src/core/explorer/export.ts` — stamp `mode: "static"`. (modify)
- `packages/tskb/src/cli/commands/explore.ts` — pass `reloadGraph` + `graphDir` to server. (modify)
- `packages/tskb/src/cli/commands/watch.ts` — remove debug cruft. (modify)
- `packages/tskb/explorer-app/src/ui/ReloadWatcher.ts` — poll logic, injectable fetch, no DOM. (create)
- `packages/tskb/explorer-app/src/ui/ReloadDialog.ts` — persistent reload bar (DOM). (create)
- `packages/tskb/explorer-app/src/main.ts` — wire watcher into `mount()`. (modify)
- `tests/unit/writer-atomic.test.ts` — atomic write + ordering. (create)
- `tests/unit/reload-watcher.test.ts` — watcher polling logic. (create)
- `tests/e2e/explorer-serve.test.ts` — `/version` + meta `mode` over the live server. (create)
- `tests/e2e/explorer-export.test.ts` — assert exported meta `mode: "static"`. (modify)
- `docs/src/tskb/explorer/serve.tskb.tsx` — document watching + `/version`. (modify)

---

## Task 1: Atomic graph writes, meta.json last

**Files:**

- Modify: `packages/tskb/src/core/graph/writer.ts`
- Test: `tests/unit/writer-atomic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/writer-atomic.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeSplitGraph } from "../../packages/tskb/src/core/graph/writer.js";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});
function tempDir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "tskb-writer-"));
  dirs.push(d);
  return d;
}

const emptyGraph = {
  metadata: { projectName: "t", generatedAt: "now" },
  nodes: {
    folders: [],
    modules: [],
    exports: [],
    terms: [],
    files: [],
    externals: [],
    flows: [],
    docs: [],
  },
  edges: [],
} as never;

describe("writeSplitGraph", () => {
  it("writes meta.json last (newest mtime of all graph files)", () => {
    const out = tempDir();
    const graphDir = writeSplitGraph(emptyGraph, out);
    const files = fs.readdirSync(graphDir).filter((f) => f.endsWith(".json"));
    const metaMtime = fs.statSync(path.join(graphDir, "meta.json")).mtimeMs;
    for (const f of files) {
      expect(fs.statSync(path.join(graphDir, f)).mtimeMs).toBeLessThanOrEqual(metaMtime);
    }
  });

  it("leaves no .tmp files behind", () => {
    const out = tempDir();
    const graphDir = writeSplitGraph(emptyGraph, out);
    expect(fs.readdirSync(graphDir).some((f) => f.endsWith(".tmp"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/writer-atomic.test.ts`
Expected: FAIL — meta.json is currently written first, so its mtime is not the newest.

- [ ] **Step 3: Implement atomic writes + reorder**

In `packages/tskb/src/core/graph/writer.ts`, add the helper near the other internal helpers:

```ts
function writeAtomic(filePath: string, data: string): void {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, data, "utf-8");
  fs.renameSync(tmp, filePath);
}
```

Replace the body of `writeSplitGraph` (the `fs.writeFileSync(...)` block) with atomic writes, meta.json LAST:

```ts
export function writeSplitGraph(graph: KnowledgeGraph, outputDir: string): string {
  const graphDir = path.join(outputDir, GRAPH_DIR_NAME);
  fs.mkdirSync(graphDir, { recursive: true });

  writeAtomic(path.join(graphDir, "folders.json"), compact(graph.nodes.folders));
  writeAtomic(path.join(graphDir, "modules.json"), compact(graph.nodes.modules));
  writeAtomic(path.join(graphDir, "exports.json"), compact(graph.nodes.exports));
  writeAtomic(path.join(graphDir, "terms.json"), compact(graph.nodes.terms));
  writeAtomic(path.join(graphDir, "files.json"), compact(graph.nodes.files));
  writeAtomic(path.join(graphDir, "externals.json"), compact(graph.nodes.externals));
  writeAtomic(path.join(graphDir, "flows.json"), compact(graph.nodes.flows));
  writeAtomic(path.join(graphDir, "docs.json"), compact(graph.nodes.docs));
  writeAtomic(path.join(graphDir, "edges.json"), compact(graph.edges));
  writeAtomic(path.join(graphDir, "search-index.json"), compact(buildSearchIndex(graph)));
  // meta.json LAST: its mtime is the "new graph is fully written" signal.
  writeAtomic(path.join(graphDir, "meta.json"), compact(graph.metadata));

  return graphDir;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/writer-atomic.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/src/core/graph/writer.ts tests/unit/writer-atomic.test.ts
git commit -m "feat(writer): atomic graph writes with meta.json written last"
```

---

## Task 2: Export `findGraphDir` from graph-loader

**Files:**

- Modify: `packages/tskb/src/cli/utils/graph-loader.ts`

- [ ] **Step 1: Export the helper**

In `packages/tskb/src/cli/utils/graph-loader.ts`, change the internal `findGraphDir` declaration from `function findGraphDir()` to an exported function (keep the body identical):

```ts
export function findGraphDir(): string {
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build -w packages/tskb`
Expected: builds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/src/cli/utils/graph-loader.ts
git commit -m "refactor(graph-loader): export findGraphDir for the explore server"
```

---

## Task 3: Add `mode` + `version` to MetaChunk

**Files:**

- Modify: `packages/tskb/src/core/explorer/transform.ts:36-55`

- [ ] **Step 1: Extend the interface**

In `packages/tskb/src/core/explorer/transform.ts`, add two optional fields to the `MetaChunk` interface (after `folderIds`):

```ts
  /** Delivery mode of this meta chunk: "served" by the live server, "static" by export. */
  mode?: "served" | "static";
  /** meta.json mtime (ms). Only set in served mode; used by the browser reload watcher. */
  version?: number;
```

`transformGraph` leaves both unset — each delivery path sets them.

- [ ] **Step 2: Verify it compiles**

Run: `npm run build -w packages/tskb`
Expected: builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/src/core/explorer/transform.ts
git commit -m "feat(explorer): add mode/version fields to MetaChunk"
```

---

## Task 4: Static export stamps `mode: "static"`

**Files:**

- Modify: `packages/tskb/src/core/explorer/export.ts:34-37`
- Test: `tests/e2e/explorer-export.test.ts`

- [ ] **Step 1: Write the failing test**

Append to the `describe("explorer export", ...)` block in `tests/e2e/explorer-export.test.ts`:

```ts
it("marks the exported meta chunk as static", () => {
  const meta = JSON.parse(fs.readFileSync(path.join(exportDir, "chunks", "meta.json"), "utf-8"));
  expect(meta.mode).toBe("static");
  expect(meta.version).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build -w packages/tskb && npx vitest run tests/e2e/explorer-export.test.ts`
Expected: FAIL — `meta.mode` is currently `undefined`.

- [ ] **Step 3: Stamp the mode in export**

In `packages/tskb/src/core/explorer/export.ts`, in `exportExplorer`, after `const chunks = transformGraph(graph);`, set the mode before writing meta:

```ts
const chunks = transformGraph(graph);
chunks.meta.mode = "static";

fs.writeFileSync(path.join(chunksDir, "meta.json"), JSON.stringify(chunks.meta));
```

(Leave the other `writeFileSync` lines unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run build -w packages/tskb && npx vitest run tests/e2e/explorer-export.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/src/core/explorer/export.ts tests/e2e/explorer-export.test.ts
git commit -m "feat(explorer): mark exported meta chunk as static"
```

---

## Task 5: Server — buildChunkCache, stamp served meta, `/version`, graph watching

**Files:**

- Modify: `packages/tskb/src/core/explorer/server.ts`
- Modify: `packages/tskb/src/cli/commands/explore.ts`
- Test: `tests/e2e/explorer-serve.test.ts`

- [ ] **Step 1: Write the failing E2E test**

Create `tests/e2e/explorer-serve.test.ts`:

```ts
/**
 * Tests for the live `tskb explore` server: the /version endpoint, the served
 * meta chunk's mode/version, and that a graph rebuild bumps /version.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { FIXTURE_DIR, TSKB_BIN, GRAPH_DIR } from "./helpers.js";

const PORT = 4477;
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess;

async function waitFor(fn: () => Promise<boolean>, timeoutMs = 8000): Promise<void> {
  const start = Date.now();
  while (!(await fn().catch(() => false))) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 50));
  }
}

beforeAll(async () => {
  server = spawn("node", [TSKB_BIN, "explore", "--port", String(PORT), "--no-open"], {
    cwd: FIXTURE_DIR,
    stdio: "ignore",
  });
  await waitFor(async () => (await fetch(`${BASE}/version`)).ok);
});

afterAll(() => {
  server?.kill();
});

describe("explorer serve", () => {
  it("serves /version as a number", async () => {
    const data = await (await fetch(`${BASE}/version`)).json();
    expect(typeof data.version).toBe("number");
  });

  it("stamps the served meta chunk with mode 'served' and a version", async () => {
    const meta = await (await fetch(`${BASE}/chunks/meta.json`)).json();
    expect(meta.mode).toBe("served");
    expect(typeof meta.version).toBe("number");
  });

  it("bumps /version after the graph is rewritten", async () => {
    const before = (await (await fetch(`${BASE}/version`)).json()).version as number;

    // Rewrite meta.json with a newer mtime to simulate a rebuild commit.
    const metaPath = path.join(GRAPH_DIR, "meta.json");
    const metaRaw = fs.readFileSync(metaPath, "utf-8");
    await new Promise((r) => setTimeout(r, 50));
    fs.writeFileSync(metaPath, metaRaw, "utf-8");

    await waitFor(async () => {
      const v = (await (await fetch(`${BASE}/version`)).json()).version as number;
      return v !== before;
    });

    const after = (await (await fetch(`${BASE}/version`)).json()).version as number;
    expect(after).not.toBe(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build -w packages/tskb && npx vitest run tests/e2e/explorer-serve.test.ts`
Expected: FAIL — `/version` 404s; `waitFor` in `beforeAll` times out.

- [ ] **Step 3: Rework the server**

Replace `packages/tskb/src/core/explorer/server.ts` with:

```ts
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { info } from "../../cli/utils/logger.js";
import { transformGraph, sanitizeFolderId } from "./transform.js";
import { watchPaths } from "../../cli/utils/watcher.js";
import type { KnowledgeGraph } from "../graph/types.js";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

/** Absolute path to the pre-built explorer SPA (dist/explorer/) */
function explorerDistDir(): string {
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(selfDir, "../../explorer");
}

export interface ServeDeps {
  /** Re-reads the graph from disk. Defaults to the caller-provided reloader. */
  reloadGraph?: () => KnowledgeGraph;
  /** Directory to watch for graph changes (the `.tskb/graph/` dir). */
  graphDir?: string;
}

/** Builds all chunk JSON strings, stamping the served meta with mode + version. */
function buildChunkCache(graph: KnowledgeGraph, version: number): Map<string, string> {
  const chunks = transformGraph(graph);
  chunks.meta.mode = "served";
  chunks.meta.version = version;

  const cache = new Map<string, string>();
  cache.set("meta", JSON.stringify(chunks.meta));
  cache.set("search-index", JSON.stringify(chunks.searchIndex));
  for (const [id, chunk] of chunks.folders) {
    cache.set(`folder-${sanitizeFolderId(id)}`, JSON.stringify(chunk));
  }
  return cache;
}

function metaMtime(graphDir: string | undefined): number {
  if (!graphDir) return Date.now();
  try {
    return fs.statSync(path.join(graphDir, "meta.json")).mtimeMs;
  } catch {
    return Date.now();
  }
}

export async function serveExplorer(
  graph: KnowledgeGraph,
  port: number,
  autoOpen: boolean,
  deps: ServeDeps = {}
): Promise<void> {
  const distDir = explorerDistDir();

  if (!fs.existsSync(distDir)) {
    throw new Error(
      `Explorer assets not found at ${distDir}\n` +
        `The tskb package appears to be incompletely built. ` +
        `If you are developing tskb, run 'npm run build:explorer' first.`
    );
  }

  let currentVersion = metaMtime(deps.graphDir);
  let chunkCache = buildChunkCache(graph, currentVersion);

  // Watch the graph directory: when meta.json's mtime changes, reload + rebuild.
  let reloading = false;
  let watcher: { close(): void } | undefined;
  if (deps.graphDir && deps.reloadGraph) {
    const reloadGraph = deps.reloadGraph;
    watcher = watchPaths([deps.graphDir], () => {
      const mtime = metaMtime(deps.graphDir);
      if (mtime === currentVersion || reloading) return;
      reloading = true;
      try {
        const next = reloadGraph();
        currentVersion = mtime;
        chunkCache = buildChunkCache(next, currentVersion);
        info(`🔄 Graph changed — explorer chunks refreshed (v${currentVersion}).`);
      } catch (err) {
        // Keep serving the previous good cache; the next change event retries.
        info(`⚠️  Graph reload skipped: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        reloading = false;
      }
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    // ── Version endpoint ───────────────────────────────────────────────
    if (pathname === "/version") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(JSON.stringify({ version: currentVersion }));
      return;
    }

    // ── Chunk API ──────────────────────────────────────────────────────
    const chunkMatch = pathname.match(/^\/chunks\/(.+)\.json$/);
    if (chunkMatch) {
      const key = chunkMatch[1];
      const data = chunkCache.get(key);
      if (data) {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(data);
      } else {
        res.writeHead(404);
        res.end(`Chunk not found: ${key}`);
      }
      return;
    }

    // ── Static SPA assets ──────────────────────────────────────────────
    const filePath = pathname === "/" ? "/index.html" : pathname;
    const absPath = path.join(distDir, filePath);

    if (!absPath.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(absPath)) {
      const indexPath = path.join(distDir, "index.html");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(fs.readFileSync(indexPath));
      return;
    }

    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    res.end(fs.readFileSync(absPath));
  });

  await new Promise<void>((resolve) => {
    server.listen(port, () => resolve());
  });

  const url = `http://localhost:${port}`;
  info(`Explorer running at ${url}`);
  info(`Press Ctrl+C to stop.`);

  if (autoOpen) openBrowser(url);

  process.once("SIGINT", () => {
    watcher?.close();
    process.exit(0);
  });

  await new Promise<void>(() => {});
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === "win32"
      ? `start "" "${url}"`
      : process.platform === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;

  exec(cmd, (err) => {
    if (err) info(`Could not open browser automatically: ${err.message}`);
  });
}
```

- [ ] **Step 4: Wire explore.ts to pass reloadGraph + graphDir**

Replace `packages/tskb/src/cli/commands/explore.ts` with:

```ts
import path from "node:path";
import { loadGraph, findGraphDir } from "../utils/graph-loader.js";
import { info } from "../utils/logger.js";

export interface ExploreOptions {
  port: number;
  open: boolean;
  /** undefined = serve mode; string = export path */
  exportPath: string | undefined;
}

export async function explore(opts: ExploreOptions): Promise<void> {
  const graph = loadGraph();

  if (opts.exportPath !== undefined) {
    const outDir = opts.exportPath || ".tskb/explorer";
    const { exportExplorer } = await import("../../core/explorer/index.js");
    await exportExplorer(graph, outDir);
    info(`Explorer exported to ${outDir}`);
    info(`Open: ${path.join(outDir, "index.html")}`);
  } else {
    const { serveExplorer } = await import("../../core/explorer/index.js");
    await serveExplorer(graph, opts.port, opts.open, {
      graphDir: findGraphDir(),
      reloadGraph: () => loadGraph(),
    });
  }
}
```

- [ ] **Step 5: Confirm `serveExplorer` is exported from the explorer index**

Run: `npx grep -n "serveExplorer" packages/tskb/src/core/explorer/index.ts` (or open the file).
Expected: `serveExplorer` is re-exported. If not, add `export { serveExplorer } from "./server.js";`. (It is already used by explore.ts today, so this should already be present.)

- [ ] **Step 6: Run the E2E test**

Run: `npm run build -w packages/tskb && npx vitest run tests/e2e/explorer-serve.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 7: Commit**

```bash
git add packages/tskb/src/core/explorer/server.ts packages/tskb/src/cli/commands/explore.ts tests/e2e/explorer-serve.test.ts
git commit -m "feat(explorer): watch graph and serve /version for reload prompts"
```

---

## Task 6: SPA ReloadWatcher (poll logic, no DOM)

**Files:**

- Create: `packages/tskb/explorer-app/src/ui/ReloadWatcher.ts`
- Test: `tests/unit/reload-watcher.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/reload-watcher.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import { startReloadWatcher } from "../../packages/tskb/explorer-app/src/ui/ReloadWatcher.js";

const stops: Array<() => void> = [];
afterEach(() => {
  for (const s of stops.splice(0)) s();
});

async function waitFor(fn: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("startReloadWatcher", () => {
  it("does not poll when mode is not 'served'", async () => {
    let calls = 0;
    const handle = startReloadWatcher({
      mode: "static",
      baseline: 1,
      onUpdate: () => {},
      intervalMs: 10,
      fetchVersion: async () => {
        calls++;
        return 2;
      },
    });
    stops.push(handle.stop);
    await new Promise((r) => setTimeout(r, 100));
    expect(calls).toBe(0);
  });

  it("fires onUpdate once when the version changes", async () => {
    let updates = 0;
    let current = 1;
    const handle = startReloadWatcher({
      mode: "served",
      baseline: 1,
      onUpdate: () => updates++,
      intervalMs: 10,
      fetchVersion: async () => current,
    });
    stops.push(handle.stop);

    await new Promise((r) => setTimeout(r, 50));
    expect(updates).toBe(0); // unchanged

    current = 2;
    await waitFor(() => updates === 1);

    // Baseline advanced — no repeated nagging for the same version.
    await new Promise((r) => setTimeout(r, 50));
    expect(updates).toBe(1);
  });

  it("ignores fetch errors and keeps polling", async () => {
    let updates = 0;
    let mode: "throw" | number = "throw";
    const handle = startReloadWatcher({
      mode: "served",
      baseline: 1,
      onUpdate: () => updates++,
      intervalMs: 10,
      fetchVersion: async () => {
        if (mode === "throw") throw new Error("network");
        return mode;
      },
    });
    stops.push(handle.stop);

    await new Promise((r) => setTimeout(r, 50));
    mode = 3;
    await waitFor(() => updates === 1);
    expect(updates).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/reload-watcher.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the watcher**

Create `packages/tskb/explorer-app/src/ui/ReloadWatcher.ts`:

```ts
// ─── ReloadWatcher ────────────────────────────────────────────────────────────
// Polls the live explore server's /version endpoint. When the version changes
// from the page's baseline, calls onUpdate (which shows the reload dialog).
// Disabled entirely unless the meta chunk says mode === "served", so the same
// SPA build is a no-op in the static export.

export interface ReloadWatcherOptions {
  /** meta.mode from the loaded meta chunk. */
  mode: string | undefined;
  /** meta.version from the loaded meta chunk (the page's starting version). */
  baseline: number | undefined;
  /** Called each time a new version is detected. */
  onUpdate: () => void;
  /** Poll interval in ms. Default 3000. */
  intervalMs?: number;
  /** Injectable fetcher (tests). Returns the current version or undefined. */
  fetchVersion?: () => Promise<number | undefined>;
}

export interface ReloadWatcherHandle {
  stop(): void;
}

async function defaultFetchVersion(): Promise<number | undefined> {
  const res = await fetch("/version", { cache: "no-store" });
  if (!res.ok) return undefined;
  const data = (await res.json()) as { version?: unknown };
  return typeof data.version === "number" ? data.version : undefined;
}

export function startReloadWatcher(opts: ReloadWatcherOptions): ReloadWatcherHandle {
  if (opts.mode !== "served") return { stop() {} };

  const intervalMs = opts.intervalMs ?? 3000;
  const fetchVersion = opts.fetchVersion ?? defaultFetchVersion;
  let baseline = opts.baseline;

  const timer = setInterval(() => {
    void (async () => {
      try {
        const version = await fetchVersion();
        if (version === undefined) return;
        if (baseline === undefined) {
          baseline = version;
          return;
        }
        if (version !== baseline) {
          baseline = version; // advance so we don't re-nag for the same change
          opts.onUpdate();
        }
      } catch {
        // Network blip — treat as no change and keep polling.
      }
    })();
  }, intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/reload-watcher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/explorer-app/src/ui/ReloadWatcher.ts tests/unit/reload-watcher.test.ts
git commit -m "feat(explorer-app): ReloadWatcher polls /version for graph changes"
```

---

## Task 7: SPA ReloadDialog (persistent reload bar)

**Files:**

- Create: `packages/tskb/explorer-app/src/ui/ReloadDialog.ts`

- [ ] **Step 1: Implement the dialog**

Create `packages/tskb/explorer-app/src/ui/ReloadDialog.ts`. Modeled on `Toast.ts` styling but persistent (no auto-dismiss), with a Reload button and a dismiss ✕:

```ts
// ─── ReloadDialog ──────────────────────────────────────────────────────────────
// Persistent bottom-center bar shown when the graph changes under a live server.
// "Reload" does a full page reload (re-fetches fresh chunks); ✕ just hides it.

let el: HTMLDivElement | null = null;

export function showReloadDialog(): void {
  if (el) {
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
    return;
  }

  el = document.createElement("div");
  el.id = "reload-dialog";
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%) translateY(8px)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderRadius: "8px",
    padding: "8px 10px 8px 14px",
    fontSize: "12px",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    fontWeight: "500",
    whiteSpace: "nowrap",
    zIndex: "650",
    opacity: "0",
    transition: "opacity 0.15s ease, transform 0.15s ease",
    boxShadow: "0 4px 12px rgba(0,0,0,0.22)",
    background: "rgba(15,23,42,0.95)",
    color: "#f1f5f9",
  } as Partial<CSSStyleDeclaration>);

  const label = document.createElement("span");
  label.textContent = "Graph updated";

  const reloadBtn = document.createElement("button");
  reloadBtn.textContent = "Reload";
  Object.assign(reloadBtn.style, {
    cursor: "pointer",
    border: "none",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: "600",
    background: "#3b82f6",
    color: "#fff",
  } as Partial<CSSStyleDeclaration>);
  reloadBtn.addEventListener("click", () => location.reload());

  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "✕";
  dismissBtn.setAttribute("aria-label", "Dismiss");
  Object.assign(dismissBtn.style, {
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: "1",
    padding: "2px 4px",
  } as Partial<CSSStyleDeclaration>);
  dismissBtn.addEventListener("click", () => hideReloadDialog());

  el.append(label, reloadBtn, dismissBtn);
  document.body.appendChild(el);

  // Trigger the fade-in on the next frame.
  requestAnimationFrame(() => {
    if (!el) return;
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
  });
}

export function hideReloadDialog(): void {
  if (!el) return;
  el.style.opacity = "0";
  el.style.transform = "translateX(-50%) translateY(8px)";
}
```

- [ ] **Step 2: Verify the explorer app builds**

Run: `npm run build:explorer -w packages/tskb` (or `npm run build -w packages/tskb`)
Expected: Vite build succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add packages/tskb/explorer-app/src/ui/ReloadDialog.ts
git commit -m "feat(explorer-app): persistent reload dialog for graph changes"
```

---

## Task 8: Wire ReloadWatcher into ExplorerApp.mount

**Files:**

- Modify: `packages/tskb/explorer-app/src/main.ts`

- [ ] **Step 1: Import the watcher + dialog**

At the top of `packages/tskb/explorer-app/src/main.ts`, add imports alongside the other `./ui/*` imports:

```ts
import { startReloadWatcher } from "./ui/ReloadWatcher";
import { showReloadDialog } from "./ui/ReloadDialog";
```

- [ ] **Step 2: Start the watcher after initial data loads**

In the `ExplorerApp.mount()` method, after the existing `await this.loadInitialData();` call, add:

```ts
// Reload-on-change: only active when served by a live `tskb explore` server
// (meta.mode === "served"). No-op in the static export.
const meta = await this.loader.load("meta");
startReloadWatcher({
  mode: (meta as { mode?: string }).mode,
  baseline: (meta as { version?: number }).version,
  onUpdate: showReloadDialog,
});
```

(`this.loader.load("meta")` returns the cached meta chunk fetched during `loadInitialData`, so this adds no network request.)

- [ ] **Step 3: Verify the explorer app builds**

Run: `npm run build:explorer -w packages/tskb`
Expected: Vite build succeeds.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

In one terminal: `cd tests/e2e/fixture && node ../../../packages/tskb/dist/cli/index.js explore --no-open`.
In the browser at the printed URL, then re-touch the fixture graph: `node -e "const fs=require('fs');const p='tests/e2e/fixture/.tskb/graph/meta.json';fs.writeFileSync(p,fs.readFileSync(p))"`.
Expected: within ~3s the "Graph updated / Reload" bar appears. Clicking Reload refreshes the page.

- [ ] **Step 5: Commit**

```bash
git add packages/tskb/explorer-app/src/main.ts
git commit -m "feat(explorer-app): prompt to reload when the served graph changes"
```

---

## Task 9: Remove debug cruft from watch.ts

**Files:**

- Modify: `packages/tskb/src/cli/commands/watch.ts:78` and `:96-101`

- [ ] **Step 1: Delete the stray debug line**

In `packages/tskb/src/cli/commands/watch.ts`, remove the line:

```ts
info("manqqqqk");
```

- [ ] **Step 2: Collapse the duplicated watching log**

Replace the four identical lines:

```ts
info(`👀 Watching ${watched.length} path(s) for changes. Press Ctrl+C to stop.`);
info(`👀 Watching ${watched.length} path(s) for changes. Press Ctrl+C to stop.`);
info(`👀 Watching ${watched.length} path(s) for changes. Press Ctrl+C to stop.`);
info(`👀 Watching ${watched.length} path(s) for changes. Press Ctrl+C to stop.`);
```

with a single line:

```ts
info(`👀 Watching ${watched.length} path(s) for changes. Press Ctrl+C to stop.`);
```

- [ ] **Step 3: Verify build**

Run: `npm run build -w packages/tskb`
Expected: builds cleanly.

- [ ] **Step 4: Commit**

```bash
git add packages/tskb/src/cli/commands/watch.ts
git commit -m "chore(watch): remove leftover debug logging"
```

---

## Task 10: Update docs + rebuild graph

**Files:**

- Modify: `docs/src/tskb/explorer/serve.tskb.tsx`

- [ ] **Step 1: Document the new behavior**

In `docs/src/tskb/explorer/serve.tskb.tsx`, add a short section (matching the file's existing JSX prose style) covering:

- The server watches the `.tskb/graph/` directory; when `meta.json`'s mtime changes it reloads the graph and rebuilds the in-memory chunk cache.
- `GET /version` returns `{ version }` (meta.json mtime). The served meta chunk carries `mode: "served"` and `version`; the static export carries `mode: "static"`.
- The browser's `ReloadWatcher` polls `/version` and shows a reload dialog on change; it is inert in the static export.

- [ ] **Step 2: Rebuild the knowledge graph**

Run: `npm run build:docs`
Expected: regenerates `.tskb/graph/*` and `docs-export/` with no errors.

- [ ] **Step 3: Commit**

```bash
git add docs/src/tskb/explorer/serve.tskb.tsx .tskb docs-export
git commit -m "docs(explorer): document reload-on-change and /version endpoint"
```

---

## Final verification

- [ ] **Run the full test suite**

Run: `npm run build && npm test`
Expected: all unit and E2E tests pass.

- [ ] **Lint**

Run: `npm run lint`
Expected: no errors.

```

```
