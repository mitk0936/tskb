import path from "node:path";
import { loadGraph } from "../utils/graph-loader.js";
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
    await serveExplorer(graph, opts.port, opts.open);
  }
}
