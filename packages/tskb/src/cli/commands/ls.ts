import fs from "node:fs";
import type { KnowledgeGraph, FolderNode, GraphEdge } from "../../core/graph/types.js";
import { REPO_ROOT_FOLDER_NAME } from "../../core/constants.js";
import { findGraphFile } from "../utils/graph-finder.js";

/**
 * Result from listing folders in the knowledge graph
 */
interface LsResult {
  root: string;
  depth: number;
  folders: Array<{
    id: string;
    depth: number;
    desc?: string;
    path?: string;
  }>;
}

/**
 * List all folders in the knowledge graph from the root
 *
 * @param maxDepth - Maximum depth to traverse (-1 for unlimited, default: 1)
 */
export async function ls(maxDepth: number = 1): Promise<void> {
  // Find and load the knowledge graph
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  // Find the root folder (Package.Root)
  const rootId = REPO_ROOT_FOLDER_NAME;
  const rootFolder = graph.nodes.folders[rootId];

  if (!rootFolder) {
    console.error(
      JSON.stringify(
        {
          error: "Root folder not found in graph",
          rootId,
          suggestion: "The graph must contain a 'Package.Root' folder node.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const result = listFolders(graph, rootId, maxDepth);
  console.log(JSON.stringify(result, null, 2));
}

/**
 * Recursively list all folders up to the specified depth
 */
function listFolders(graph: KnowledgeGraph, rootId: string, maxDepth: number): LsResult {
  const folders: Array<{ id: string; depth: number; desc?: string; path?: string }> = [];
  const visited = new Set<string>();

  function traverse(folderId: string, currentDepth: number) {
    // Avoid cycles
    if (visited.has(folderId)) return;
    visited.add(folderId);

    const folder = graph.nodes.folders[folderId];
    if (!folder) return;

    // Add this folder to results
    folders.push({
      id: folderId,
      depth: currentDepth,
      desc: folder.desc,
      path: folder.resolvedPath || folder.path,
    });

    // Stop if we've reached max depth (unless maxDepth is -1 for unlimited)
    if (maxDepth !== -1 && currentDepth >= maxDepth) {
      return;
    }

    // Find child folders via "contains" edges
    const childFolders = findChildFolders(graph.edges, folderId);

    // Traverse each child
    for (const childId of childFolders) {
      traverse(childId, currentDepth + 1);
    }
  }

  // Start traversal from root at depth 0
  traverse(rootId, 0);

  // Sort folders by depth (ascending) to ensure root elements appear first
  folders.sort((a, b) => a.depth - b.depth);

  return {
    root: rootId,
    depth: maxDepth,
    folders,
  };
}

/**
 * Find all child folder IDs that this folder contains
 */
function findChildFolders(edges: GraphEdge[], folderId: string): string[] {
  const children: string[] = [];

  for (const edge of edges) {
    if (edge.from === folderId && edge.type === "contains") {
      children.push(edge.to);
    }
  }

  return children;
}
