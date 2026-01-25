import type { KnowledgeGraph } from "../../core/graph/types.js";
import { generateDot } from "../../core/visualization/index.js";
import fs from "node:fs/promises";

/**
 * Visualize command - generates a Graphviz DOT file from a knowledge graph JSON.
 *
 * This is a thin CLI wrapper around the core visualization module.
 *
 * @param graphPath - Path to the knowledge graph JSON file
 * @param outputPath - Path where the DOT file should be written
 */
export async function visualize(graphPath: string, outputPath: string) {
  console.log("Visualizing knowledge graph...");
  console.log(`   Input: ${graphPath}`);
  console.log(`   Output: ${outputPath}`);

  // Read the knowledge graph
  const graphJson = await fs.readFile(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  // Generate DOT content
  const dot = generateDot(graph);

  // Write DOT file
  await fs.writeFile(outputPath, dot, "utf-8");

  console.log("DOT file generated!");
  console.log(`   Render with: dot -Tpng ${outputPath} -o graph.png`);
  console.log(`   Or view with: xdot ${outputPath}`);
}
