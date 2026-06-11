import path from "node:path";

import { loadGraph, findGraphDir } from "../utils/graph-loader.js";
import { createLogger } from "../../log/index.js";

const log = createLogger("cli:explore");

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
    log.info(`Explorer exported to ${outDir}`);
    log.info(`Open: ${path.join(outDir, "index.html")}`);
  } else {
    const { serveExplorer } = await import("../../core/explorer/index.js");
    await serveExplorer(graph, opts.port, opts.open, {
      graphDir: findGraphDir(),
      reloadGraph: () => loadGraph(),
    });
  }
}
