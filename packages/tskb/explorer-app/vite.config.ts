import { defineConfig, type ViteDevServer } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to the graph snapshot dir used during dev */
const GRAPH_DIR = path.resolve(__dirname, "../../../.tskb/graph");
/** meta.json — written last by `tskb build`, so its mtime gates cache invalidation */
const GRAPH_JSON = path.join(GRAPH_DIR, "meta.json");
/** Absolute path to the transform module (loaded via ssrLoadModule — no build needed) */
const TRANSFORM_MOD = path.resolve(__dirname, "../src/core/explorer/transform.ts");

/**
 * Reassembles the full KnowledgeGraph from the split JSON files `tskb build`
 * writes. transformGraph needs the whole graph (nodes + edges); meta.json alone
 * is just `metadata`, which makes the transform throw ("edges is not iterable").
 */
function loadFullGraph() {
  const readJson = (name: string) =>
    JSON.parse(fs.readFileSync(path.join(GRAPH_DIR, name), "utf-8"));
  return {
    metadata: readJson("meta.json"),
    nodes: {
      folders: readJson("folders.json"),
      modules: readJson("modules.json"),
      exports: readJson("exports.json"),
      terms: readJson("terms.json"),
      files: readJson("files.json"),
      externals: readJson("externals.json"),
      flows: readJson("flows.json"),
      docs: readJson("docs.json"),
    },
    edges: readJson("edges.json"),
  };
}

// ─── Chunk cache (invalidated when meta.json changes) ────────────────────────

let chunkCache: Map<string, string> | null = null;

async function buildChunkCache(server: ViteDevServer): Promise<Map<string, string>> {
  if (chunkCache) return chunkCache;

  const graph = loadFullGraph();
  const { transformGraph, sanitizeFolderId } = (await server.ssrLoadModule(TRANSFORM_MOD)) as {
    transformGraph: (g: unknown) => {
      meta: unknown;
      folders: Map<string, unknown>;
      searchIndex: unknown;
    };
    sanitizeFolderId: (id: string) => string;
  };

  const result = transformGraph(graph);
  const cache = new Map<string, string>();

  cache.set("meta", JSON.stringify(result.meta));
  cache.set("search-index", JSON.stringify(result.searchIndex));
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
            res.end(
              JSON.stringify({ error: `${GRAPH_JSON} not found — run \`tskb build\` first` })
            );
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
