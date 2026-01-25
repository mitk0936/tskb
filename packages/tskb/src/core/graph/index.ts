/**
 * Graph Module - Builds knowledge graphs from extracted data
 *
 * Public API for creating queryable graph structures.
 */

export type {
  KnowledgeGraph,
  FolderNode,
  ModuleNode,
  TermNode,
  DocNode,
  GraphEdge,
  EdgeType,
} from "./types.js";

import { buildGraph } from "./builder.js";

export { buildGraph } from "./builder.js";

/**
 * Build a knowledge graph from extraction results.
 *
 * This is the main entry point for graph building. It:
 * - Creates nodes from folders, modules, terms, and docs
 * - Builds reference edges between nodes
 * - Infers hierarchical relationships from paths
 * - Determines module-to-folder membership
 *
 * @param registry - Extracted vocabulary (folders, modules, terms)
 * @param documentation - Extracted documentation files
 * @param baseDir - Base directory for normalizing file paths
 * @returns Complete knowledge graph with nodes and edges
 */
export function buildKnowledgeGraph(
  registry: import("../extraction/index.js").ExtractedRegistry,
  documentation: import("../extraction/index.js").ExtractedDoc[],
  baseDir: string
): import("./types.js").KnowledgeGraph {
  return buildGraph(registry, documentation, baseDir);
}
