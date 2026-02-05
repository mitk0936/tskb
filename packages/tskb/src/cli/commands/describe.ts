import fs from "node:fs";
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
 * @param folderId - Folder ID from the knowledge graph (e.g., "tskb.cli", "Package.Root")
 */
export async function describe(graphPath: string, folderId: string): Promise<void> {
  // Load the knowledge graph
  if (!fs.existsSync(graphPath)) {
    console.error(`Error: Graph file not found: ${graphPath}`);
    process.exit(1);
  }

  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  // Find the folder node by ID
  const folderNode = graph.nodes.folders[folderId];

  if (!folderNode) {
    console.log(
      JSON.stringify(
        {
          error: "Folder not found in graph",
          folderId,
          suggestion:
            "Use a valid folder ID from the knowledge graph. Folder IDs are shown in the 'id' field when describing other folders.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const result = describeContext(graph, folderId);

  if (!result) {
    console.error(
      JSON.stringify(
        {
          error: "Failed to describe folder context",
          folderId,
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
