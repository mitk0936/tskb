import fs from "node:fs";
import path from "node:path";

/**
 * Find the .tskb/graph.json file from the current working directory
 *
 * @returns Absolute path to the graph.json file
 * @throws Error if graph.json is not found
 */
export function findGraphFile(): string {
  const cwd = process.cwd();
  const graphPath = path.join(cwd, ".tskb", "graph.json");

  if (!fs.existsSync(graphPath)) {
    throw new Error(
      `Graph file not found at ${graphPath}\n\n` +
        `Make sure you run 'tskb build' first to generate the knowledge graph.`
    );
  }

  return graphPath;
}
