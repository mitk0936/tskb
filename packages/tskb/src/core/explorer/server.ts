import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath } from "node:url";
import { info } from "../../cli/utils/logger.js";
import { transformGraph, sanitizeFolderId } from "./transform.js";
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
  // From dist/core/explorer/ → dist/explorer/
  return path.resolve(selfDir, "../../explorer");
}

export async function serveExplorer(
  graph: KnowledgeGraph,
  port: number,
  autoOpen: boolean
): Promise<void> {
  const distDir = explorerDistDir();

  if (!fs.existsSync(distDir)) {
    throw new Error(
      `Explorer assets not found at ${distDir}\n` +
        `Run 'npm run build:app' inside packages/tskb/ first.`
    );
  }

  // Pre-generate all chunks once (immutable for this session)
  const chunks = transformGraph(graph);
  const chunkCache = new Map<string, string>();

  // meta
  chunkCache.set("meta", JSON.stringify(chunks.meta));
  // search index
  chunkCache.set("search-index", JSON.stringify(chunks.searchIndex));
  // folder chunks
  for (const [id, chunk] of chunks.folders) {
    chunkCache.set(`folder-${sanitizeFolderId(id)}`, JSON.stringify(chunk));
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const pathname = url.pathname;

    // ── Chunk API ──────────────────────────────────────────────────────
    const chunkMatch = pathname.match(/^\/chunks\/(.+)\.json$/);
    if (chunkMatch) {
      const key = chunkMatch[1]; // e.g. "meta" or "folder-xyz"
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

    // Security: stay inside distDir
    if (!absPath.startsWith(distDir)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (!fs.existsSync(absPath)) {
      // SPA fallback
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

  // Keep alive until killed
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
