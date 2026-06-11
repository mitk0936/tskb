import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createLogger } from "../../log/index.js";
import { transformGraph, sanitizeFolderId } from "./transform.js";
import type { KnowledgeGraph } from "../graph/types.js";

const log = createLogger("core:explorer");

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

/** meta.json's mtime (ms), or null if it can't be read (missing / mid-rebuild). */
function metaMtime(graphDir: string | undefined): number | null {
  if (!graphDir) return null;
  try {
    return fs.statSync(path.join(graphDir, "meta.json")).mtimeMs;
  } catch {
    return null;
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

  let currentVersion = metaMtime(deps.graphDir) ?? Date.now();
  let chunkCache = buildChunkCache(graph, currentVersion);

  // Poll meta.json's mtime to detect rebuilds. We poll rather than fs.watch the
  // graph dir because `tskb build` deletes and recreates the whole `.tskb`
  // directory on every build — a recursive watch bound to the old directory
  // inode goes dead the moment it's removed. statSync follows the path, so it
  // survives the dir being recreated. meta.json is written last (atomically), so
  // a changed mtime means a complete new graph is on disk.
  let reloading = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  if (deps.graphDir && deps.reloadGraph) {
    const reloadGraph = deps.reloadGraph;
    pollTimer = setInterval(() => {
      const mtime = metaMtime(deps.graphDir);
      if (mtime === null || mtime === currentVersion || reloading) return;
      reloading = true;
      try {
        const next = reloadGraph();
        currentVersion = mtime;
        chunkCache = buildChunkCache(next, currentVersion);
        info(`🔄 Graph changed — explorer chunks refreshed (v${currentVersion}).`);
      } catch (err) {
        // Keep serving the previous good cache; the next poll retries.
        info(`⚠️  Graph reload skipped: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        reloading = false;
      }
    }, 1000);
    pollTimer.unref?.();
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
  log.info(`Explorer running at ${url}`);
  log.info(`Press Ctrl+C to stop.`);

  if (autoOpen) openBrowser(url);

  process.once("SIGINT", () => {
    if (pollTimer) clearInterval(pollTimer);
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
    if (err) log.info(`Could not open browser automatically: ${err.message}`);
  });
}
