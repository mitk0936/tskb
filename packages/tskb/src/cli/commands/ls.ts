import fs from "node:fs";
import type { KnowledgeGraph, GraphEdge } from "../../core/graph/types.js";
import { ROOT_FOLDER_NAME } from "../../core/constants.js";
import { findGraphFile } from "../utils/graph-finder.js";

/**
 * Result from listing folders in the knowledge graph
 */
interface LsResult {
  root: string;
  folders: Array<{
    id: string;
    desc?: string;
    path?: string;
  }>;
  docs: Array<{
    id: string;
    explains: string;
    filePath: string;
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
  const rootId = ROOT_FOLDER_NAME;
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
 * Calculate the actual filesystem depth based on the path
 */
function calculatePathDepth(path: string | undefined): number {
  if (!path || path === ".") return 0;
  // Count the number of path separators
  return path.split("/").filter((segment) => segment.length > 0).length;
}

/**
 * Recursively list all folders up to the specified depth
 */
/**
 * Build a lookup from parent folder ID to its children via "contains" edges
 */
function buildChildIndex(edges: GraphEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.type === "contains") {
      let children = index.get(edge.from);
      if (!children) {
        children = [];
        index.set(edge.from, children);
      }
      children.push(edge.to);
    }
  }
  return index;
}

function listFolders(graph: KnowledgeGraph, rootId: string, maxDepth: number): LsResult {
  const folders: Array<{ id: string; desc?: string; path?: string }> = [];
  const visited = new Set<string>();
  const childIndex = buildChildIndex(graph.edges);

  function traverse(folderId: string) {
    if (visited.has(folderId)) return;
    visited.add(folderId);

    const folder = graph.nodes.folders[folderId];
    if (!folder) return;

    const folderPath = folder.path;
    const actualDepth = calculatePathDepth(folderPath);

    folders.push({
      id: folderId,
      desc: folder.desc,
      path: folderPath,
    });

    if (maxDepth !== -1 && actualDepth >= maxDepth) {
      return;
    }

    const children = childIndex.get(folderId);
    if (children) {
      for (const childId of children) {
        traverse(childId);
      }
    }
  }

  traverse(rootId);

  folders.sort((a, b) => (a.path ?? "").localeCompare(b.path ?? ""));

  // Collect essential docs and deduplicate by ID
  const docsMap = new Map<string, { id: string; explains: string; filePath: string }>();
  Object.values(graph.nodes.docs)
    .filter((d) => d.priority === "essential")
    .forEach((d) => {
      // Use doc ID as the unique key to prevent duplicates
      if (!docsMap.has(d.id)) {
        docsMap.set(d.id, { id: d.id, explains: d.explains, filePath: d.filePath });
      }
    });

  const docs = Array.from(docsMap.values()).sort((a, b) => a.filePath.localeCompare(b.filePath));

  return {
    root: rootId,
    folders,
    docs,
  };
}
