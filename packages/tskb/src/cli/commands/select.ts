import fs from "node:fs";
import type { KnowledgeGraph, AnyNode, GraphEdge } from "../../core/graph/types.js";

/**
 * Result from selecting a node in the knowledge graph
 */
interface SelectResult {
  match: {
    id: string;
    type: string;
    desc?: string;
    confidence: number; // 0-1
  };
  parent?: {
    id: string;
    type: string;
    desc?: string;
  };
  children: Array<{
    id: string;
    type: string;
    desc?: string;
  }>;
  docs: Array<{
    id: string;
    filePath: string;
    excerpt: string;
  }>;
  files: string[];
  suggestions: string[]; // Only when confidence < 0.7
}

/**
 * Internal match result used during search
 */
interface MatchCandidate {
  id: string;
  node: AnyNode;
  matchedFields: string[];
  score: number;
  edges: {
    incoming: GraphEdge[];
    outgoing: GraphEdge[];
  };
}

/**
 * Select a single best-matching node from the knowledge graph
 *
 * @param graphPath - Path to the knowledge graph JSON file
 * @param searchTerm - Search term to match against nodes
 * @param concise - Output concise format optimized for AI consumption (default: true)
 */
export async function select(
  graphPath: string,
  searchTerm: string,
  concise: boolean = true
): Promise<void> {
  // Load the knowledge graph
  if (!fs.existsSync(graphPath)) {
    console.error(`Error: Graph file not found: ${graphPath}`);
    process.exit(1);
  }

  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  const result = selectBestMatch(graph, searchTerm, concise);

  if (!result) {
    console.error(
      JSON.stringify(
        {
          error: "No matching node found",
          searchTerm,
          suggestion: "Try a different search term or check the graph contents",
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
 * Search across all nodes and return the best match
 */
function selectBestMatch(
  graph: KnowledgeGraph,
  searchTerm: string,
  concise: boolean
): SelectResult | null {
  const candidates: MatchCandidate[] = [];
  const lowerSearchTerm = searchTerm.toLowerCase();

  // Collect all matching candidates
  for (const [id, node] of Object.entries(graph.nodes.folders)) {
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.modules)) {
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.terms)) {
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.exports)) {
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.docs)) {
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) {
    return null;
  }

  // Sort by score (highest first)
  candidates.sort((a, b) => b.score - a.score);

  // Get best match
  const bestMatch = candidates[0]!;
  const confidence = calculateConfidence(bestMatch);

  // Generate suggestions if confidence is low
  const suggestions =
    confidence < 0.7 ? generateAlternativeSuggestions(candidates.slice(1, 6)) : [];

  // Build result
  return buildSelectResult(bestMatch, confidence, suggestions, graph, concise);
}

/**
 * Check if a node matches the search term
 */
function matchNode(
  id: string,
  node: AnyNode,
  searchTerm: string,
  allEdges: GraphEdge[]
): MatchCandidate | null {
  const matchedFields: string[] = [];
  let score = 0;

  const idLower = id.toLowerCase();

  // Exact ID match (highest priority)
  if (idLower === searchTerm) {
    matchedFields.push("id:exact");
    score += 100;
  } else if (idLower.startsWith(searchTerm)) {
    matchedFields.push("id:prefix");
    score += 80;
  } else if (idLower.includes(searchTerm)) {
    matchedFields.push("id:substring");
    score += 50;
  }

  // Search in description
  if ("desc" in node) {
    const descLower = node.desc.toLowerCase();
    if (descLower === searchTerm) {
      matchedFields.push("desc:exact");
      score += 40;
    } else if (descLower.includes(searchTerm)) {
      matchedFields.push("desc:substring");
      score += 20;
    }
  }

  // Search in paths
  if ("resolvedPath" in node && node.resolvedPath) {
    const pathLower = node.resolvedPath.toLowerCase();
    if (pathLower === searchTerm) {
      matchedFields.push("resolvedPath:exact");
      score += 90;
    } else if (pathLower.includes(searchTerm)) {
      matchedFields.push("resolvedPath:substring");
      score += 60;
    }
  }

  if ("path" in node && node.path) {
    const pathLower = node.path.toLowerCase();
    if (pathLower.includes(searchTerm)) {
      matchedFields.push("path:substring");
      score += 55;
    }
  }

  if ("filePath" in node) {
    const filePathLower = node.filePath.toLowerCase();
    if (filePathLower === searchTerm) {
      matchedFields.push("filePath:exact");
      score += 90;
    } else if (filePathLower.includes(searchTerm)) {
      matchedFields.push("filePath:substring");
      score += 60;
    }
  }

  // Search in import paths
  if ("importPath" in node && node.importPath) {
    const importLower = node.importPath.toLowerCase();
    if (importLower.includes(searchTerm)) {
      matchedFields.push("importPath:substring");
      score += 55;
    }
  }

  // Search in doc content (lowest priority)
  if (node.type === "doc" && node.content.toLowerCase().includes(searchTerm)) {
    matchedFields.push("content:substring");
    score += 10;
  }

  if (matchedFields.length === 0) {
    return null;
  }

  const edges = getNodeEdges(allEdges, id);

  return {
    id,
    node,
    matchedFields,
    score,
    edges,
  };
}

/**
 * Calculate match confidence (0-1)
 */
function calculateConfidence(candidate: MatchCandidate): number {
  const hasExactMatch = candidate.matchedFields.some((f) => f.includes(":exact"));
  const hasPrefixMatch = candidate.matchedFields.some((f) => f.includes(":prefix"));
  const hasPathMatch = candidate.matchedFields.some(
    (f) => f.startsWith("resolvedPath") || f.startsWith("filePath") || f.startsWith("path")
  );

  if (hasExactMatch) {
    return 1.0;
  } else if (hasPrefixMatch) {
    return 0.85;
  } else if (hasPathMatch) {
    return 0.75;
  } else if (candidate.score >= 50) {
    return 0.65;
  } else if (candidate.score >= 20) {
    return 0.5;
  } else {
    return 0.3;
  }
}

/**
 * Generate alternative suggestions from other candidates
 */
function generateAlternativeSuggestions(candidates: MatchCandidate[]): string[] {
  return candidates.slice(0, 5).map((c) => {
    const desc = "desc" in c.node ? c.node.desc : undefined;
    return desc
      ? `${c.id} (${c.node.type}): ${desc.substring(0, 60)}${desc.length > 60 ? "..." : ""}`
      : `${c.id} (${c.node.type})`;
  });
}

/**
 * Build the final select result
 */
function buildSelectResult(
  candidate: MatchCandidate,
  confidence: number,
  suggestions: string[],
  graph: KnowledgeGraph,
  concise: boolean
): SelectResult {
  const { id, node, edges } = candidate;

  // Find parent
  const parent = findParent(edges, graph);

  // Find children
  const children = findChildren(edges, graph);

  // Extract documentation
  const docs = extractDocs(id, node, edges, graph, concise);

  // Extract files
  const files = extractAllFiles(node, edges, graph, concise);

  return {
    match: {
      id,
      type: node.type,
      desc: "desc" in node ? node.desc : undefined,
      confidence,
    },
    parent,
    children,
    docs,
    files,
    suggestions,
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
 * Find parent node from edges
 */
function findParent(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): { id: string; type: string; desc?: string } | undefined {
  const parentEdge =
    edges.outgoing.find((e) => e.type === "belongs-to") ||
    edges.incoming.find((e) => e.type === "contains");

  if (!parentEdge) return undefined;

  const parentId = parentEdge.type === "belongs-to" ? parentEdge.to : parentEdge.from;
  const parentNode = findNodeById(parentId, graph);

  if (!parentNode) return undefined;

  return {
    id: parentId,
    type: parentNode.type,
    desc: "desc" in parentNode ? parentNode.desc : undefined,
  };
}

/**
 * Find children nodes from edges
 */
function findChildren(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): Array<{ id: string; type: string; desc?: string }> {
  const children: Array<{ id: string; type: string; desc?: string }> = [];

  // Children are nodes that belong-to this node or are contained by it
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const childNode = findNodeById(edge.from, graph);
      if (childNode) {
        children.push({
          id: edge.from,
          type: childNode.type,
          desc: "desc" in childNode ? childNode.desc : undefined,
        });
      }
    }
  }

  for (const edge of edges.outgoing) {
    if (edge.type === "contains") {
      const childNode = findNodeById(edge.to, graph);
      if (childNode) {
        children.push({
          id: edge.to,
          type: childNode.type,
          desc: "desc" in childNode ? childNode.desc : undefined,
        });
      }
    }
  }

  return children;
}

/**
 * Extract documentation nodes
 */
function extractDocs(
  id: string,
  node: AnyNode,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph,
  concise: boolean
): Array<{ id: string; filePath: string; excerpt: string }> {
  const docs: Array<{ id: string; filePath: string; excerpt: string }> = [];
  const excerptLength = concise ? 100 : 200;

  // If this is a doc node, include it
  if (node.type === "doc") {
    const excerpt = node.content.substring(0, excerptLength).replace(/\s+/g, " ").trim();
    docs.push({
      id,
      filePath: node.filePath,
      excerpt: excerpt + (node.content.length > excerptLength ? "..." : ""),
    });
  }

  // Find related doc nodes (docs that reference this node)
  const maxDocs = concise ? 3 : 10;
  for (const edge of edges.incoming) {
    if (edge.type === "references" && docs.length < maxDocs) {
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
 * Extract file paths from node and related nodes
 */
function extractAllFiles(
  node: AnyNode,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph,
  concise: boolean
): string[] {
  const files: string[] = [];
  const maxFiles = concise ? 5 : 15;

  // Primary file
  const primaryFile = extractPrimaryFile(node);
  if (primaryFile) {
    files.push(primaryFile);
  }

  // Related files from connected nodes
  for (const edge of [...edges.incoming, ...edges.outgoing]) {
    if (files.length >= maxFiles) break;

    const relatedId = edge.from === node.id ? edge.to : edge.from;
    const relatedNode = findNodeById(relatedId, graph);

    if (!relatedNode) continue;

    const filePath = extractPrimaryFile(relatedNode);
    if (filePath && !files.includes(filePath)) {
      files.push(filePath);
    }
  }

  return files;
}

/**
 * Extract primary file from node
 */
function extractPrimaryFile(node: AnyNode): string | undefined {
  if ("resolvedPath" in node && node.resolvedPath) {
    return node.resolvedPath;
  } else if ("filePath" in node) {
    return node.filePath;
  } else if ("path" in node && node.path) {
    return node.path;
  }
  return undefined;
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
