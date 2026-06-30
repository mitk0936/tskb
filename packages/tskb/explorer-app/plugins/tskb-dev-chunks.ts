import type { Plugin, ViteDevServer } from "vite";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GRAPH_DIR = path.resolve(__dirname, "../../../../.tskb/graph");
const GRAPH_JSON = path.join(GRAPH_DIR, "meta.json");
const TRANSFORM_MOD = path.resolve(__dirname, "../../src/core/explorer/transform.ts");

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
let currentVersion: number = Date.now();

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
  currentVersion = Date.now();
  (result.meta as Record<string, unknown>).mode = "served";
  (result.meta as Record<string, unknown>).version = currentVersion;

  const cache = new Map<string, string>();

  cache.set("meta", JSON.stringify(result.meta));
  cache.set("search-index", JSON.stringify(result.searchIndex));
  for (const [id, chunk] of result.folders) {
    cache.set(`folder-${sanitizeFolderId(id)}`, JSON.stringify(chunk));
  }

  chunkCache = cache;
  return cache;
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export function tskbDevChunks(): Plugin {
  return {
    name: "tskb-dev-chunks",
    apply: "serve",

    configureServer(server) {
      // Poll meta.json mtime rather than watching it. `tskb build` deletes and
      // recreates the entire .tskb/ directory, which kills any fs.watch bound to
      // the old inode. Stat polling survives the recreate (same approach as the
      // production server in explorer/server.ts).
      let lastMtime = 0;
      try {
        lastMtime = fs.statSync(GRAPH_JSON).mtimeMs;
      } catch {
        // graph not built yet — will pick up on first successful stat
      }

      const pollInterval = setInterval(() => {
        try {
          const mtime = fs.statSync(GRAPH_JSON).mtimeMs;
          if (mtime !== lastMtime) {
            lastMtime = mtime;
            chunkCache = null;
            currentVersion = Date.now();
            console.log("[tskb-dev-chunks] graph changed, new version:", currentVersion);
          }
        } catch {
          // file doesn't exist (yet or mid-rebuild) — skip
        }
      }, 1000);

      server.httpServer?.on("close", () => clearInterval(pollInterval));

      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "";
        const pathname = url.split("?")[0];

        if (pathname === "/version") {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-cache");
          res.end(JSON.stringify({ version: currentVersion }));
          return;
        }

        const match = pathname.match(/^\/chunks\/(.+)\.json$/);
        if (!match) return next();

        const key = match[1];

        if (!fs.existsSync(GRAPH_JSON)) {
          res.statusCode = 503;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: `${GRAPH_JSON} not found — run \`tskb build\` first` }));
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
  };
}
