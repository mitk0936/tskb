import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { KnowledgeGraph, AnyNode, GraphEdge } from "../../core/graph/types.js";

/**
 * Result from describing a folder context in the knowledge graph
 */
interface DescribeResult {
  context: {
    id: string;
    type: string;
    desc?: string;
    path?: string;
  };
  parent?: {
    id: string;
    type: string;
    desc?: string;
  };
  contents: Array<{
    id: string;
    type: string;
    desc?: string;
  }>;
  modules: Array<{
    id: string;
    desc?: string;
    path?: string;
  }>;
  exports: Array<{
    id: string;
    desc?: string;
    path?: string;
  }>;
  referencedInDocs: Array<{
    id: string;
    filePath: string;
    excerpt: string;
  }>;
}

/**
 * Describe a folder context from the knowledge graph
 *
 * @param graphPath - Path to the knowledge graph JSON file
 * @param folderPath - Filesystem path to the folder (relative, absolute, or from repo root)
 */
export async function describe(graphPath: string, folderPath: string): Promise<void> {
  // Load the knowledge graph
  if (!fs.existsSync(graphPath)) {
    console.error(`Error: Graph file not found: ${graphPath}`);
    process.exit(1);
  }

  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  // Find the folder node by path
  const folderNode = findFolderByPath(graph, folderPath);

  if (!folderNode) {
    // Find closest parent and children
    const closestMatch = findClosestMatch(graph, folderPath);
    console.log(
      JSON.stringify(
        {
          error: "Folder not found in graph",
          path: folderPath,
          closestParent: closestMatch.parent,
          closestChildren: closestMatch.children,
          suggestion: closestMatch.parent
            ? `The closest defined parent is "${closestMatch.parent.path}". Try describing that instead.`
            : "No parent folder found in graph. Try using a path relative to the repository root.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const result = describeContext(graph, folderNode.id);

  if (!result) {
    console.error(
      JSON.stringify(
        {
          error: "Failed to describe folder context",
          path: folderPath,
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

/**
 * Find the closest parent and children when exact path doesn't exist
 */
function findClosestMatch(
  graph: KnowledgeGraph,
  inputPath: string
): {
  parent: { id: string; type: string; desc?: string; path?: string } | null;
  children: Array<{ id: string; type: string; desc?: string; path?: string }>;
} {
  // Normalize the input path the same way findFolderByPath does
  let resolvedPath = inputPath;
  if (inputPath.startsWith(".")) {
    resolvedPath = path.resolve(process.cwd(), inputPath);
  }

  let normalizedInput = normalizePath(resolvedPath);

  // If input is an absolute path, try to convert it to relative
  if (path.isAbsolute(resolvedPath)) {
    try {
      const repoRoot = getRepoRoot();
      if (repoRoot) {
        const relativePath = path.relative(repoRoot, resolvedPath);
        normalizedInput = normalizePath(relativePath);
      }
    } catch (e) {
      // Continue with absolute path
    }
  }

  // Find closest parent by walking up the path
  let closestParent: { id: string; type: string; desc?: string; path?: string } | null = null;
  const pathSegments = normalizedInput.split("/").filter(Boolean);

  // Try progressively shorter paths by removing segments from the end
  for (let i = pathSegments.length - 1; i > 0; i--) {
    const parentPath = pathSegments.slice(0, i).join("/");
    const parentNode = findFolderByPath(graph, parentPath);

    if (parentNode) {
      const node = parentNode.node;
      closestParent = {
        id: parentNode.id,
        type: node.type,
        desc: node.desc,
        path: node.resolvedPath || node.path,
      };
      break;
    }
  }

  // Find closest children by comparing all folders in the graph
  const descendants: Array<{
    id: string;
    type: string;
    desc?: string;
    path?: string;
    depth: number;
  }> = [];

  for (const [id, node] of Object.entries(graph.nodes.folders)) {
    const nodePath = node.resolvedPath || node.path;
    if (!nodePath) continue;

    const normalizedNodePath = normalizePath(nodePath);
    const nodeSegments = normalizedNodePath.split("/").filter(Boolean);

    // Check if this node is a descendant by comparing path segments
    if (nodeSegments.length > pathSegments.length) {
      const isDescendant = pathSegments.every((seg, idx) => nodeSegments[idx] === seg);

      if (isDescendant) {
        const depth = nodeSegments.length - pathSegments.length;
        descendants.push({
          id,
          type: node.type,
          desc: node.desc,
          path: node.resolvedPath || node.path,
          depth,
        });
      }
    }
  }

  // Find the minimum depth among all descendants
  const minDepth = descendants.length > 0 ? Math.min(...descendants.map((d) => d.depth)) : 0;

  // Return only descendants at the minimum depth (closest children)
  const closestChildren = descendants
    .filter((d) => d.depth === minDepth)
    .map(({ id, type, desc, path }) => ({ id, type, desc, path }));

  return { parent: closestParent, children: closestChildren };
}

/**
 * Find a folder node by filesystem path
 */
function findFolderByPath(
  graph: KnowledgeGraph,
  inputPath: string
): { id: string; node: any } | null {
  // First resolve relative paths to absolute
  let resolvedPath = inputPath;
  if (inputPath.startsWith(".")) {
    resolvedPath = path.resolve(process.cwd(), inputPath);
  }

  // Normalize the input path
  let normalizedInput = normalizePath(resolvedPath);

  // If input is an absolute path, try to convert it to relative
  if (path.isAbsolute(resolvedPath)) {
    try {
      // Try to find the repo root and make the path relative to it
      const repoRoot = getRepoRoot();
      if (repoRoot) {
        const relativePath = path.relative(repoRoot, resolvedPath);
        normalizedInput = normalizePath(relativePath);
      }
    } catch (e) {
      // If we can't find repo root, just use the normalized absolute path
    }
  }

  // Get all possible path variants to check
  const pathVariants = [
    normalizedInput,
    // Remove common prefixes
    normalizedInput.replace(/^packages\/[^\/]+\//, ""),
    normalizedInput.replace(/^src\//, ""),
  ];

  // Search through all folder nodes
  for (const [id, node] of Object.entries(graph.nodes.folders)) {
    const nodePath = node.resolvedPath || node.path;
    if (!nodePath) continue;

    const normalizedNodePath = normalizePath(nodePath);

    // Try each variant
    for (const variant of pathVariants) {
      // Exact match
      if (normalizedNodePath === variant) {
        return { id, node };
      }

      // Node path ends with the variant (e.g., "packages/tskb/src/cli" ends with "src/cli")
      if (normalizedNodePath.endsWith("/" + variant) || normalizedNodePath.endsWith(variant)) {
        return { id, node };
      }

      // Variant ends with node path (e.g., variant might be longer)
      if (variant.endsWith("/" + normalizedNodePath) || variant.endsWith(normalizedNodePath)) {
        return { id, node };
      }
    }
  }

  return null;
}

/**
 * Get the git repository root
 */
function getRepoRoot(): string | null {
  try {
    const root = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
    return root;
  } catch (e) {
    return null;
  }
}

/**
 * Normalize a path for comparison
 */
function normalizePath(p: string): string {
  // Remove leading/trailing slashes and normalize separators
  return p
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

/**
 * Build a description of the folder context
 */
function describeContext(graph: KnowledgeGraph, contextId: string): DescribeResult | null {
  // Find the folder node
  const folderNode = graph.nodes.folders[contextId];
  if (!folderNode) {
    return null;
  }

  // Get all edges for this folder
  const edges = getNodeEdges(graph.edges, contextId);

  // Find parent folder
  const parent = findParentFolder(edges, graph);

  // Find direct contents (folders contained within this folder)
  const contents = findContents(edges, graph);

  // Find modules that belong to this folder
  const modules = findBelongingModules(edges, graph);

  // Find exports that belong to this folder
  const exports = findBelongingExports(edges, graph);

  // Find docs that reference this folder
  const referencedInDocs = findReferencingDocs(edges, graph);

  return {
    context: {
      id: contextId,
      type: folderNode.type,
      desc: folderNode.desc,
      path: folderNode.resolvedPath || folderNode.path,
    },
    parent,
    contents,
    modules,
    exports,
    referencedInDocs,
  };
}

/**
 * Get all edges connected to a node
 */
function getNodeEdges(
  allEdges: GraphEdge[],
  nodeId: string
): {
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
} {
  const incoming: GraphEdge[] = [];
  const outgoing: GraphEdge[] = [];

  for (const edge of allEdges) {
    if (edge.to === nodeId) {
      incoming.push(edge);
    }
    if (edge.from === nodeId) {
      outgoing.push(edge);
    }
  }

  return { incoming, outgoing };
}

/**
 * Find parent folder
 */
function findParentFolder(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): { id: string; type: string; desc?: string } | undefined {
  // Look for outgoing "belongs-to" or incoming "contains" edges
  const parentEdge =
    edges.outgoing.find((e) => e.type === "belongs-to") ||
    edges.incoming.find((e) => e.type === "contains");

  if (!parentEdge) return undefined;

  const parentId = parentEdge.type === "belongs-to" ? parentEdge.to : parentEdge.from;
  const parentNode = graph.nodes.folders[parentId];

  if (!parentNode) return undefined;

  return {
    id: parentId,
    type: parentNode.type,
    desc: parentNode.desc,
  };
}

/**
 * Find contents (child folders) contained within this folder
 */
function findContents(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): Array<{ id: string; type: string; desc?: string }> {
  const contents: Array<{ id: string; type: string; desc?: string }> = [];

  // Look for outgoing "contains" edges (this folder contains other folders)
  for (const edge of edges.outgoing) {
    if (edge.type === "contains") {
      const childNode = findNodeById(edge.to, graph);
      if (childNode) {
        contents.push({
          id: edge.to,
          type: childNode.type,
          desc: "desc" in childNode ? childNode.desc : undefined,
        });
      }
    }
  }

  return contents;
}

/**
 * Find modules that belong to this folder
 */
function findBelongingModules(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): Array<{ id: string; desc?: string; path?: string }> {
  const modules: Array<{ id: string; desc?: string; path?: string }> = [];

  // Look for incoming "belongs-to" edges from modules
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const moduleNode = graph.nodes.modules[edge.from];
      if (moduleNode) {
        modules.push({
          id: edge.from,
          desc: moduleNode.desc,
          path: moduleNode.resolvedPath || moduleNode.importPath,
        });
      }
    }
  }

  return modules;
}

/**
 * Find exports that belong to this folder
 */
function findBelongingExports(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): Array<{ id: string; desc?: string; path?: string }> {
  const exports: Array<{ id: string; desc?: string; path?: string }> = [];

  // Look for incoming "belongs-to" edges from exports
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const exportNode = graph.nodes.exports[edge.from];
      if (exportNode) {
        exports.push({
          id: edge.from,
          desc: exportNode.desc,
          path: exportNode.resolvedPath || exportNode.importPath,
        });
      }
    }
  }

  return exports;
}

/**
 * Find docs that reference this folder
 */
function findReferencingDocs(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): Array<{ id: string; filePath: string; excerpt: string }> {
  const docs: Array<{ id: string; filePath: string; excerpt: string }> = [];
  const excerptLength = 100;

  // Look for incoming "references" edges from docs
  for (const edge of edges.incoming) {
    if (edge.type === "references") {
      const docNode = graph.nodes.docs[edge.from];
      if (docNode) {
        const excerpt = docNode.content.substring(0, excerptLength).replace(/\s+/g, " ").trim();
        docs.push({
          id: edge.from,
          filePath: docNode.filePath,
          excerpt: excerpt + (docNode.content.length > excerptLength ? "..." : ""),
        });
      }
    }
  }

  return docs;
}

/**
 * Find any node by ID across all node types
 */
function findNodeById(id: string, graph: KnowledgeGraph): AnyNode | null {
  return (
    graph.nodes.folders[id] ||
    graph.nodes.modules[id] ||
    graph.nodes.terms[id] ||
    graph.nodes.exports[id] ||
    graph.nodes.docs[id] ||
    null
  );
}
