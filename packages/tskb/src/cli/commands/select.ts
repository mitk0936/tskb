import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
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
 * Select a single best-matching node from the knowledge graph within a specified scope
 *
 * @param graphPath - Path to the knowledge graph JSON file
 * @param searchTerm - Search term to match against nodes
 * @param scopePath - Folder path to scope the search
 * @param concise - Output concise format optimized for AI consumption (default: true)
 */
export async function select(
  graphPath: string,
  searchTerm: string,
  scopePath: string,
  concise: boolean = true
): Promise<void> {
  // Load the knowledge graph
  if (!fs.existsSync(graphPath)) {
    console.error(`Error: Graph file not found: ${graphPath}`);
    process.exit(1);
  }

  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  // Find the scope folder
  const scopeFolder = findFolderByPath(graph, scopePath);

  if (!scopeFolder) {
    console.error(
      JSON.stringify(
        {
          error: "Scope folder not found in graph",
          scopePath,
          suggestion:
            "Verify the folder path exists in the graph. Use 'describe' to explore the structure.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const result = selectBestMatch(graph, searchTerm, scopeFolder.id, concise);

  if (!result) {
    console.error(
      JSON.stringify(
        {
          error: "No matching node found in scope",
          searchTerm,
          scopePath,
          scopeId: scopeFolder.id,
          suggestion: "Try a different search term or expand the scope",
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
 * Search across nodes within a scope and return the best match
 */
function selectBestMatch(
  graph: KnowledgeGraph,
  searchTerm: string,
  scopeFolderId: string,
  concise: boolean
): SelectResult | null {
  const candidates: MatchCandidate[] = [];
  const lowerSearchTerm = searchTerm.toLowerCase();

  // Get the scope folder and build the scope set (folder + all descendants)
  const scopeNodeIds = buildScopeSet(graph, scopeFolderId);

  // Collect all matching candidates within scope
  for (const [id, node] of Object.entries(graph.nodes.folders)) {
    if (!isInScope(id, node, scopeNodeIds, graph)) continue;
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.modules)) {
    if (!isInScope(id, node, scopeNodeIds, graph)) continue;
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.terms)) {
    if (!isInScope(id, node, scopeNodeIds, graph)) continue;
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.exports)) {
    if (!isInScope(id, node, scopeNodeIds, graph)) continue;
    const candidate = matchNode(id, node, lowerSearchTerm, graph.edges);
    if (candidate) candidates.push(candidate);
  }

  for (const [id, node] of Object.entries(graph.nodes.docs)) {
    if (!isInScope(id, node, scopeNodeIds, graph)) continue;
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
 * Check if a node matches the search term (supports multi-word phrases)
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
  const searchWords = searchTerm.split(/\s+/).filter((w) => w.length > 0);
  const isMultiWord = searchWords.length > 1;

  // Exact ID match (highest priority)
  if (idLower === searchTerm) {
    matchedFields.push("id:exact");
    score += isMultiWord ? 120 : 100; // Boost multi-word exact matches
  } else if (idLower.startsWith(searchTerm)) {
    matchedFields.push("id:prefix");
    score += isMultiWord ? 95 : 80;
  } else if (idLower.includes(searchTerm)) {
    matchedFields.push("id:phrase");
    score += isMultiWord ? 70 : 50;
  } else if (isMultiWord && allWordsMatch(idLower, searchWords)) {
    matchedFields.push("id:all-words");
    score += 40; // Lower than phrase, higher than single word substring
  }

  // Search in description
  if ("desc" in node) {
    const descLower = node.desc.toLowerCase();
    if (descLower === searchTerm) {
      matchedFields.push("desc:exact");
      score += isMultiWord ? 50 : 40;
    } else if (descLower.includes(searchTerm)) {
      matchedFields.push("desc:phrase");
      score += isMultiWord ? 30 : 20;
    } else if (isMultiWord && allWordsMatch(descLower, searchWords)) {
      matchedFields.push("desc:all-words");
      score += 15;
    }
  }

  // Search in paths
  if ("resolvedPath" in node && node.resolvedPath) {
    const pathLower = node.resolvedPath.toLowerCase();
    if (pathLower === searchTerm) {
      matchedFields.push("resolvedPath:exact");
      score += isMultiWord ? 105 : 90;
    } else if (pathLower.includes(searchTerm)) {
      matchedFields.push("resolvedPath:phrase");
      score += isMultiWord ? 75 : 60;
    } else if (isMultiWord && allWordsMatch(pathLower, searchWords)) {
      matchedFields.push("resolvedPath:all-words");
      score += 45;
    }
  }

  if ("path" in node && node.path) {
    const pathLower = node.path.toLowerCase();
    if (pathLower.includes(searchTerm)) {
      matchedFields.push("path:phrase");
      score += isMultiWord ? 65 : 55;
    } else if (isMultiWord && allWordsMatch(pathLower, searchWords)) {
      matchedFields.push("path:all-words");
      score += 40;
    }
  }

  if ("filePath" in node) {
    const filePathLower = node.filePath.toLowerCase();
    if (filePathLower === searchTerm) {
      matchedFields.push("filePath:exact");
      score += isMultiWord ? 105 : 90;
    } else if (filePathLower.includes(searchTerm)) {
      matchedFields.push("filePath:phrase");
      score += isMultiWord ? 75 : 60;
    } else if (isMultiWord && allWordsMatch(filePathLower, searchWords)) {
      matchedFields.push("filePath:all-words");
      score += 45;
    }
  }

  // Search in import paths
  if ("importPath" in node && node.importPath) {
    const importLower = node.importPath.toLowerCase();
    if (importLower.includes(searchTerm)) {
      matchedFields.push("importPath:phrase");
      score += isMultiWord ? 65 : 55;
    } else if (isMultiWord && allWordsMatch(importLower, searchWords)) {
      matchedFields.push("importPath:all-words");
      score += 40;
    }
  }

  // Search in doc content (lowest priority)
  if (node.type === "doc") {
    const contentLower = node.content.toLowerCase();
    if (contentLower.includes(searchTerm)) {
      matchedFields.push("content:phrase");
      score += isMultiWord ? 15 : 10;
    } else if (isMultiWord && allWordsMatch(contentLower, searchWords)) {
      matchedFields.push("content:all-words");
      score += 8;
    }
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
 * Check if all words in the search term appear in the text (in any order)
 */
function allWordsMatch(text: string, words: string[]): boolean {
  return words.every((word) => text.includes(word));
}

/**
 * Calculate match confidence (0-1)
 */
function calculateConfidence(candidate: MatchCandidate): number {
  const hasExactMatch = candidate.matchedFields.some((f) => f.includes(":exact"));
  const hasPrefixMatch = candidate.matchedFields.some((f) => f.includes(":prefix"));
  const hasPhraseMatch = candidate.matchedFields.some((f) => f.includes(":phrase"));
  const hasAllWordsMatch = candidate.matchedFields.some((f) => f.includes(":all-words"));
  const hasPathMatch = candidate.matchedFields.some(
    (f) => f.startsWith("resolvedPath") || f.startsWith("filePath") || f.startsWith("path")
  );

  if (hasExactMatch) {
    return 1.0;
  } else if (hasPrefixMatch) {
    return 0.85;
  } else if (hasPhraseMatch && hasPathMatch) {
    return 0.8; // Multi-word phrase in path
  } else if (hasPathMatch) {
    return 0.75;
  } else if (hasPhraseMatch) {
    return 0.7; // Multi-word phrase match
  } else if (hasAllWordsMatch) {
    return 0.6; // All words present but not as phrase
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

/**
 * Find a folder node by filesystem path (repo-relative or absolute)
 */
function findFolderByPath(
  graph: KnowledgeGraph,
  inputPath: string
): { id: string; node: any } | null {
  let normalizedInput: string;

  // If absolute path, convert to repo-relative
  if (path.isAbsolute(inputPath)) {
    try {
      const repoRoot = getRepoRoot();
      if (!repoRoot) {
        console.error("Error: Cannot resolve absolute path - not in a git repository");
        return null;
      }
      const relativePath = path.relative(repoRoot, inputPath);
      normalizedInput = normalizePath(relativePath);
    } catch (e) {
      return null;
    }
  } else {
    // Treat as repo-relative path
    normalizedInput = normalizePath(inputPath);
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

      // Node path ends with the variant
      if (normalizedNodePath.endsWith("/" + variant) || normalizedNodePath.endsWith(variant)) {
        return { id, node };
      }

      // Variant ends with node path
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
  return p
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

/**
 * Build a set of all folder IDs within the scope (scope folder + all descendants)
 */
function buildScopeSet(graph: KnowledgeGraph, scopeFolderId: string): Set<string> {
  const scopeSet = new Set<string>();
  scopeSet.add(scopeFolderId);

  // Add all descendant folders
  const toVisit = [scopeFolderId];
  while (toVisit.length > 0) {
    const currentId = toVisit.pop()!;

    // Find all folders that belong to or are contained by the current folder
    for (const edge of graph.edges) {
      if (edge.from === currentId && edge.type === "contains") {
        const childNode = graph.nodes.folders[edge.to];
        if (childNode && !scopeSet.has(edge.to)) {
          scopeSet.add(edge.to);
          toVisit.push(edge.to);
        }
      }
    }
  }

  return scopeSet;
}

/**
 * Check if a node is within the scope
 */
function isInScope(
  nodeId: string,
  node: AnyNode,
  scopeFolderIds: Set<string>,
  graph: KnowledgeGraph
): boolean {
  // If the node itself is a folder in scope, it's in scope
  if (node.type === "folder" && scopeFolderIds.has(nodeId)) {
    return true;
  }

  // For non-folder nodes, check if they belong to a folder in scope
  for (const edge of graph.edges) {
    if (edge.from === nodeId && edge.type === "belongs-to") {
      if (scopeFolderIds.has(edge.to)) {
        return true;
      }
    }
  }

  return false;
}
