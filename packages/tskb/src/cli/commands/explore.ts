import fs from "node:fs";
import path from "node:path";
import { findGraphFile } from "../utils/graph-finder.js";
import { info, error } from "../utils/logger.js";
import type { KnowledgeGraph } from "../../core/graph/types.js";

export interface ExploreOptions {
  port: number;
  open: boolean;
  /** undefined = serve mode; string = export path */
  exportPath: string | undefined;
}

export async function explore(opts: ExploreOptions): Promise<void> {
  const graphPath = findGraphFile();
  const graph: KnowledgeGraph = JSON.parse(fs.readFileSync(graphPath, "utf-8"));

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
