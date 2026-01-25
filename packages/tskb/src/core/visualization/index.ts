/**
 * Visualization Module - Generates visual representations of knowledge graphs
 *
 * Public API for creating visualizations from knowledge graphs.
 */

import { generateDot } from "./dot-generator.js";

export { generateDot } from "./dot-generator.js";

/**
 * Generate a Graphviz DOT file from a knowledge graph.
 *
 * Creates a hierarchical visualization with:
 * - Nested folder subgraphs
 * - Modules grouped within folders
 * - Terms and docs in separate clusters
 * - Colored edges showing relationships
 *
 * @param graph - Knowledge graph to visualize
 * @returns DOT file content as a string
 */
export function generateDotGraph(graph: import("../graph/types.js").KnowledgeGraph): string {
  return generateDot(graph);
}
