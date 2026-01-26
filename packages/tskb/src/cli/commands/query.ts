import fs from "node:fs";
import type { KnowledgeGraph, AnyNode, GraphEdge } from "../../core/graph/types.js";

/**
 * Relationship information for connected nodes
 */
interface RelatedNode {
  id: string;
  type: string;
  desc?: string;
  relationship: string;
}

/**
 * Documentation context
 */
interface DocumentationContext {
  primary?: {
    file: string;
    excerpt: string;
  };
  relatedDocs: Array<{
    id: string;
    title: string;
  }>;
}

/**
 * Query result for a matched node
 */
interface QueryMatch {
  // Core match
  match: {
    id: string;
    type: string;
    desc?: string;
    score: number;
    matchReason: string;
  };

  // Immediate context
  context: {
    hierarchy: string[];
    parent?: {
      id: string;
      type: string;
      desc?: string;
    };
  };

  // Files to read
  files: {
    primary?: string;
    related: string[];
  };

  // Relationships
  relationships: {
    uses: RelatedNode[];
    usedBy: RelatedNode[];
    contains: RelatedNode[];
    belongsTo: RelatedNode[];
  };

  // Documentation
  documentation: DocumentationContext;

  // AI guidance
  suggestions: {
    readNext: string[];
    keywords: string[];
  };
}

/**
 * Query the knowledge graph for nodes matching the search term
 *
 * @param graphPath - Path to the knowledge graph JSON file
 * @param searchTerm - Search term to match against nodes
 * @param concise - Output concise format optimized for AI consumption (default: true)
 * @returns Array of matching nodes with their edges
 */
export async function query(
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

  const matches = searchGraph(graph, searchTerm, concise);

  // Output results wrapper
  const response = {
    query: searchTerm,
    results: matches,
    resultCount: matches.length,
  };

  console.log(JSON.stringify(response, null, 2));
}

/**
 * Search across all nodes in the graph
 */
function searchGraph(graph: KnowledgeGraph, searchTerm: string, concise: boolean): QueryMatch[] {
  const matches: QueryMatch[] = [];
  const lowerSearchTerm = searchTerm.toLowerCase();

  // Search folders
  for (const [id, node] of Object.entries(graph.nodes.folders)) {
    const result = matchNode(id, node, lowerSearchTerm, graph.edges, graph, concise);
    if (result) matches.push(result);
  }

  // Search modules
  for (const [id, node] of Object.entries(graph.nodes.modules)) {
    const result = matchNode(id, node, lowerSearchTerm, graph.edges, graph, concise);
    if (result) matches.push(result);
  }

  // Search terms
  for (const [id, node] of Object.entries(graph.nodes.terms)) {
    const result = matchNode(id, node, lowerSearchTerm, graph.edges, graph, concise);
    if (result) matches.push(result);
  }

  // Search exports
  for (const [id, node] of Object.entries(graph.nodes.exports)) {
    const result = matchNode(id, node, lowerSearchTerm, graph.edges, graph, concise);
    if (result) matches.push(result);
  }

  // Search docs
  for (const [id, node] of Object.entries(graph.nodes.docs)) {
    const result = matchNode(id, node, lowerSearchTerm, graph.edges, graph, concise);
    if (result) matches.push(result);
  }

  // Sort by score (highest first)
  return matches.sort((a, b) => b.match.score - a.match.score);
}

/**
 * Check if a node matches the search term and build enhanced match result
 */
function matchNode(
  id: string,
  node: AnyNode,
  searchTerm: string,
  allEdges: GraphEdge[],
  graph: KnowledgeGraph,
  concise: boolean
): QueryMatch | null {
  const matchedFields: string[] = [];
  let score = 0;

  // Search in ID
  if (id.toLowerCase().includes(searchTerm)) {
    matchedFields.push("id");
    score += 10; // ID matches are high priority
  }

  // Search in description
  if ("desc" in node && node.desc.toLowerCase().includes(searchTerm)) {
    matchedFields.push("desc");
    score += 5;
  }

  // Search in paths
  if ("path" in node && node.path && node.path.toLowerCase().includes(searchTerm)) {
    matchedFields.push("path");
    score += 8;
  }

  if (
    "resolvedPath" in node &&
    node.resolvedPath &&
    node.resolvedPath.toLowerCase().includes(searchTerm)
  ) {
    matchedFields.push("resolvedPath");
    score += 8;
  }

  if ("filePath" in node && node.filePath.toLowerCase().includes(searchTerm)) {
    matchedFields.push("filePath");
    score += 8;
  }

  // Search in doc content
  if (node.type === "doc" && node.content.toLowerCase().includes(searchTerm)) {
    matchedFields.push("content");
    score += 3; // Lower priority for content matches
  }

  // Search in import paths
  if (
    "importPath" in node &&
    node.importPath &&
    node.importPath.toLowerCase().includes(searchTerm)
  ) {
    matchedFields.push("importPath");
    score += 7;
  }

  // If no matches, return null
  if (matchedFields.length === 0) {
    return null;
  }

  // Get edges for this node
  const edges = getNodeEdges(allEdges, id);

  // Build enhanced response
  return buildQueryMatch(id, node, matchedFields, score, edges, graph, concise);
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
 * Build enhanced query match result with all context
 */
function buildQueryMatch(
  id: string,
  node: AnyNode,
  matchedFields: string[],
  score: number,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph,
  concise: boolean
): QueryMatch {
  if (concise) {
    // Concise mode: minimal output for AI consumption
    const parent = findParent(edges, graph);
    const primaryFile = extractPrimaryFile(node);
    const relatedFiles = extractRelatedFiles(node, edges, graph, primaryFile).slice(0, 3);

    return {
      match: {
        id,
        type: node.type,
        desc: "desc" in node ? node.desc : undefined,
        score,
        matchReason: matchedFields.join(", "),
      },
      context: {
        hierarchy: buildHierarchy(id, node, edges, graph),
        parent,
      },
      files: {
        primary: primaryFile,
        related: relatedFiles,
      },
      relationships: buildRelationships(edges, graph),
      documentation: extractDocumentation(id, node, edges, graph, true),
      suggestions: generateSuggestions(node, edges, graph, matchedFields),
    };
  }

  // Verbose mode: full context
  return {
    match: {
      id,
      type: node.type,
      desc: "desc" in node ? node.desc : undefined,
      score,
      matchReason: `Matched in ${matchedFields.join(", ")}`,
    },
    context: {
      hierarchy: buildHierarchy(id, node, edges, graph),
      parent: findParent(edges, graph),
    },
    files: extractFiles(node, edges, graph),
    relationships: buildRelationships(edges, graph),
    documentation: extractDocumentation(id, node, edges, graph, false),
    suggestions: generateSuggestions(node, edges, graph, matchedFields),
  };
}

/**
 * Build hierarchy breadcrumb from root to current node
 */
function buildHierarchy(
  id: string,
  node: AnyNode,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): string[] {
  const hierarchy: string[] = [];

  // Find belongs-to or contained-by relationships
  const parentEdge =
    edges.outgoing.find((e) => e.type === "belongs-to") ||
    edges.incoming.find((e) => e.type === "contains");

  if (parentEdge) {
    const parentId = parentEdge.type === "belongs-to" ? parentEdge.to : parentEdge.from;
    const parentNode = findNodeById(parentId, graph);

    if (parentNode) {
      // Recursively build parent hierarchy
      const parentEdges = getNodeEdges(graph.edges, parentId);
      const parentHierarchy = buildHierarchy(parentId, parentNode, parentEdges, graph);
      hierarchy.push(...parentHierarchy);
    }
  }

  hierarchy.push(id);
  return hierarchy;
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
 * Extract related files from connected nodes
 */
function extractRelatedFiles(
  node: AnyNode,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph,
  primaryFile?: string
): string[] {
  const related: string[] = [];

  for (const edge of [...edges.incoming, ...edges.outgoing]) {
    const relatedId = edge.from === (node as any).id ? edge.to : edge.from;
    const relatedNode = findNodeById(relatedId, graph);

    if (!relatedNode) continue;

    const filePath = extractPrimaryFile(relatedNode);
    if (filePath && filePath !== primaryFile && !related.includes(filePath)) {
      related.push(filePath);
    }
  }

  return related;
}

/**
 * Extract primary and related files (verbose mode)
 */
function extractFiles(
  node: AnyNode,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): { primary?: string; related: string[] } {
  const primary = extractPrimaryFile(node);
  const related = extractRelatedFiles(node, edges, graph, primary);
  return { primary, related };
}

/**
 * Build relationship categorization
 */
function buildRelationships(
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph
): {
  uses: RelatedNode[];
  usedBy: RelatedNode[];
  contains: RelatedNode[];
  belongsTo: RelatedNode[];
} {
  const uses: RelatedNode[] = [];
  const usedBy: RelatedNode[] = [];
  const contains: RelatedNode[] = [];
  const belongsTo: RelatedNode[] = [];

  // Process outgoing edges
  for (const edge of edges.outgoing) {
    const targetNode = findNodeById(edge.to, graph);
    if (!targetNode) continue;

    const relatedNode: RelatedNode = {
      id: edge.to,
      type: targetNode.type,
      desc: "desc" in targetNode ? targetNode.desc : undefined,
      relationship: edge.type,
    };

    if (edge.type === "references") {
      uses.push(relatedNode);
    } else if (edge.type === "contains") {
      contains.push(relatedNode);
    } else if (edge.type === "belongs-to") {
      belongsTo.push(relatedNode);
    }
  }

  // Process incoming edges
  for (const edge of edges.incoming) {
    const sourceNode = findNodeById(edge.from, graph);
    if (!sourceNode) continue;

    const relatedNode: RelatedNode = {
      id: edge.from,
      type: sourceNode.type,
      desc: "desc" in sourceNode ? sourceNode.desc : undefined,
      relationship: edge.type,
    };

    if (edge.type === "references") {
      usedBy.push(relatedNode);
    } else if (edge.type === "contains") {
      belongsTo.push(relatedNode);
    }
  }

  return { uses, usedBy, contains, belongsTo };
}

/**
 * Extract documentation context
 */
function extractDocumentation(
  id: string,
  node: AnyNode,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph,
  concise: boolean
): DocumentationContext {
  const relatedDocs: Array<{ id: string; title: string }> = [];
  let primary: { file: string; excerpt: string } | undefined;

  const excerptLength = concise ? 100 : 200;

  // If this is a doc node, use it as primary
  if (node.type === "doc") {
    const excerpt = node.content.substring(0, excerptLength).replace(/\s+/g, " ").trim();
    primary = {
      file: node.filePath,
      excerpt: excerpt + (node.content.length > excerptLength ? "..." : ""),
    };
  }

  // Find related doc nodes
  const maxRelatedDocs = concise ? 2 : 10;
  for (const edge of edges.incoming) {
    if (edge.type === "references" && relatedDocs.length < maxRelatedDocs) {
      const docNode = graph.nodes.docs[edge.from];
      if (docNode) {
        relatedDocs.push({
          id: edge.from,
          title: docNode.filePath.split("/").pop() || edge.from,
        });

        // Use first doc as primary if we don't have one
        if (!primary) {
          const excerpt = docNode.content.substring(0, excerptLength).replace(/\s+/g, " ").trim();
          primary = {
            file: docNode.filePath,
            excerpt: excerpt + (docNode.content.length > excerptLength ? "..." : ""),
          };
        }
      }
    }
  }

  return { primary, relatedDocs };
}

/**
 * Generate AI suggestions
 */
function generateSuggestions(
  node: AnyNode,
  edges: { incoming: GraphEdge[]; outgoing: GraphEdge[] },
  graph: KnowledgeGraph,
  matchedFields: string[]
): { readNext: string[]; keywords: string[] } {
  const readNext: string[] = [];
  const keywords: string[] = [];

  // Extract keywords from matched fields
  if (matchedFields.includes("id")) {
    keywords.push(...node.id.toLowerCase().split(/[.\-_]/));
  }

  if ("desc" in node) {
    keywords.push(...node.desc.toLowerCase().split(/\s+/).slice(0, 5));
  }

  // Generate read next suggestions
  if ("resolvedPath" in node && node.resolvedPath) {
    readNext.push(`Read ${node.resolvedPath} to understand the implementation`);
  }

  // Suggest reading parent context
  const parentEdge = edges.outgoing.find((e) => e.type === "belongs-to");
  if (parentEdge) {
    const parentNode = findNodeById(parentEdge.to, graph);
    if (parentNode && "resolvedPath" in parentNode && parentNode.resolvedPath) {
      readNext.push(`Check ${parentNode.resolvedPath} for parent context`);
    }
  }

  // Suggest reading documentation
  for (const edge of edges.incoming) {
    if (edge.type === "references") {
      const docNode = graph.nodes.docs[edge.from];
      if (docNode) {
        readNext.push(`Review ${docNode.filePath} for architecture context`);
      }
    }
  }

  return {
    readNext: readNext.slice(0, 3), // Limit to top 3
    keywords: [...new Set(keywords)].filter((k) => k.length > 2).slice(0, 5), // Dedupe and limit
  };
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
