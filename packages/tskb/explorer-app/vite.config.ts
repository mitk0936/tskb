import { defineConfig, type ViteDevServer } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the graph snapshot used during dev */
const GRAPH_JSON = path.resolve(__dirname, "../../../.tskb/graph.json");
/** Absolute path to the transform module (loaded via ssrLoadModule — no build needed) */
const TRANSFORM_MOD = path.resolve(__dirname, "../src/core/explorer/transform.ts");

// ─── Chunk cache (invalidated when graph.json changes) ────────────────────────

let chunkCache: Map<string, string> | null = null;

async function buildChunkCache(server: ViteDevServer): Promise<Map<string, string>> {
  if (chunkCache) return chunkCache;

  const graph = JSON.parse(fs.readFileSync(GRAPH_JSON, "utf-8"));
  const { transformGraph, sanitizeFolderId } = (await server.ssrLoadModule(TRANSFORM_MOD)) as {
    transformGraph: (g: unknown) => { meta: unknown; folders: Map<string, unknown> };
    sanitizeFolderId: (id: string) => string;
  };

  const result = transformGraph(graph);
  const cache = new Map<string, string>();

  cache.set("meta", JSON.stringify(result.meta));
  for (const [id, chunk] of result.folders) {
    cache.set(`folder-${sanitizeFolderId(id)}`, JSON.stringify(chunk));
  }

  chunkCache = cache;
  return cache;
}

// ─── Vite config ──────────────────────────────────────────────────────────────

export default defineConfig({
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "../dist/explorer"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["d3"],
          highlight: ["highlight.js"],
        },
      },
    },
  },
  plugins: [
    {
      name: "tskb-dev-chunks",
      configureServer(server) {
        // Invalidate chunk cache when graph.json is saved
        server.watcher.add(GRAPH_JSON);
        server.watcher.on("change", (file) => {
          if (file === GRAPH_JSON) chunkCache = null;
        });

        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? "";
          // Strip query string before matching
          const pathname = url.split("?")[0];
          const match = pathname.match(/^\/chunks\/(.+)\.json$/);
          if (!match) return next();

          const key = match[1];

          if (!fs.existsSync(GRAPH_JSON)) {
            res.statusCode = 503;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "graph.json not found — run `tskb build` first" }));
            return;
          }

          try {
            const cache = await buildChunkCache(server);
            const data = cache.get(key);

            if (!data) {
              res.statusCode = 404;
              res.end(`Chunk not found: ${key}`);
              return;
            }

            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(data);
          } catch (err) {
            console.error("[tskb-dev-chunks]", err);
            res.statusCode = 500;
            res.end(String(err));
          }
        });
      },
    },
  ],
});
