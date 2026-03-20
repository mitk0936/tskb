import fs from "node:fs";
import Fuse from "fuse.js";
import type { KnowledgeGraph, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time, jsonOut } from "../utils/logger.js";

interface SearchableNode {
  id: string;
  type: AnyNode["type"];
  desc: string;
  path: string;
  content: string; // children names (folders) or member names (modules) for deep matching
  edgeCount?: number;
  priority?: string;
  structureSummary?: string;
  morphologySummary?: string;
  importsSummary?: string;
}

interface SearchResult {
  query: string;
  results: Array<{
    nodeId: string;
    type: string;
    desc: string;
    path: string;
    score: number;
    priority?: string;
    structureSummary?: string;
    morphologySummary?: string;
    importsSummary?: string;
  }>;
}

/**
 * Build a set of neighbor IDs for each node in the graph (all edge types except references).
 */
function buildNeighborSets(
  edges: import("../../core/graph/types.js").GraphEdge[]
): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();

  function addPair(a: string, b: string) {
    let setA = neighbors.get(a);
    if (!setA) {
      setA = new Set();
      neighbors.set(a, setA);
    }
    setA.add(b);
    let setB = neighbors.get(b);
    if (!setB) {
      setB = new Set();
      neighbors.set(b, setB);
    }
    setB.add(a);
  }

  for (const edge of edges) {
    if (edge.type !== "references") {
      addPair(edge.from, edge.to);
    }
  }

  return neighbors;
}

/**
 * Search the knowledge graph for nodes matching a fuzzy query.
 * Returns ranked results across all node types.
 *
 * Scoring:
 * 1. Fuse.js fuzzy match (inverted: higher = better)
 * 2. Word-match boost (exact substring matches across fields)
 * 3. Graph proximity boost (neighbors of higher-scored results get a bump)
 * 4. Scores normalized relative to top result (top = 1.0)
 */
export async function search(query: string, optimized: boolean = false): Promise<void> {
  const loadDone = time("Loading graph");
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);
  loadDone();

  const searchDone = time("Searching");
  const nodes = buildSearchableNodes(graph);
  verbose(`   ${nodes.length} searchable nodes indexed`);

  const fuse = new Fuse(nodes, {
    keys: [
      { name: "id", weight: 0.35 },
      { name: "desc", weight: 0.25 },
      { name: "path", weight: 0.2 },
      { name: "content", weight: 0.2 },
    ],
    threshold: 0.6,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
    useExtendedSearch: true,
  });

  // For multi-word queries, OR the words so partial matches surface
  const words = query.trim().split(/\s+/);
  const fuseQuery = words.length > 1 ? words.join(" | ") : query;
  const fuseResults = fuse.search(fuseQuery);

  // Step 1: Invert Fuse score (Fuse: 0 = perfect, 1 = worst → invert to higher = better)
  // and apply word-match boost as additive points
  const lowerWords = words.map((w) => w.toLowerCase());
  const scored = fuseResults.map((r) => {
    const baseScore = 1 - (r.score ?? 1); // invert: 0→1, 1→0

    const fields = [r.item.id, r.item.desc, r.item.path, r.item.content].map((f) =>
      f.toLowerCase()
    );
    const matchCount = lowerWords.filter((w) => fields.some((f) => f.includes(w))).length;
    const matchRatio = matchCount / lowerWords.length;
    // Add up to 0.5 points for exact word matches, halve score if zero words matched
    const wordBoost = matchRatio * 0.5;
    let score = matchCount === 0 ? baseScore * 0.5 : baseScore + wordBoost;

    // Small connectivity boost: well-connected nodes get a slight bump (up to ~0.15)
    const ec = r.item.edgeCount ?? 0;
    if (ec > 1) {
      score += Math.log2(ec) * 0.05;
    }

    return { item: r.item, score };
  });

  // Step 2: Sort by score descending (higher = better) and take top candidates
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, 30); // wider pool for proximity boosting

  // Step 3: Graph proximity boost — if a result is a neighbor of a higher-scored result, boost it
  const neighbors = buildNeighborSets(graph.edges);
  for (let i = 1; i < candidates.length; i++) {
    const nodeNeighbors = neighbors.get(candidates[i].item.id);
    if (!nodeNeighbors) continue;

    // Check if any higher-ranked result is a neighbor
    for (let j = 0; j < i; j++) {
      if (nodeNeighbors.has(candidates[j].item.id)) {
        // Boost proportional to the neighbor's score (diminishing: 20% of neighbor's score)
        candidates[i].score += candidates[j].score * 0.2;
        break; // only boost once per result
      }
    }
  }

  // Re-sort after proximity boost
  candidates.sort((a, b) => b.score - a.score);

  // Step 4: Normalize scores relative to top result (top = 1.0),
  // drop results below 30% of top score, cap at 10
  const topScore = candidates.length > 0 ? candidates[0].score : 1;
  const cutoff = topScore * 0.3;

  const result: SearchResult = {
    query,
    results: candidates
      .filter((r) => r.score >= cutoff)
      .slice(0, 10)
      .map((r) => ({
        nodeId: r.item.id,
        type: r.item.type,
        desc: r.item.desc,
        path: r.item.path,
        score: Math.round((r.score / topScore) * 100) / 100,
        ...(r.item.priority ? { priority: r.item.priority } : {}),
        ...(r.item.structureSummary ? { structureSummary: r.item.structureSummary } : {}),
        ...(r.item.morphologySummary ? { morphologySummary: r.item.morphologySummary } : {}),
        ...(r.item.importsSummary ? { importsSummary: r.item.importsSummary } : {}),
      })),
  };
  searchDone();

  verbose(`   ${fuseResults.length} raw matches, returning top ${result.results.length}`);

  jsonOut(result, optimized);
}

/**
 * Flatten all node dictionaries into a single searchable array
 */
function buildSearchableNodes(graph: KnowledgeGraph): SearchableNode[] {
  const nodes: SearchableNode[] = [];

  for (const dict of Object.values(graph.nodes)) {
    for (const [id, node] of Object.entries(dict)) {
      nodes.push({
        id,
        type: node.type,
        desc: getDesc(node),
        path: getPath(node),
        content: getContent(node),
        ...(node.edgeCount ? { edgeCount: node.edgeCount } : {}),
        ...(node.type === "doc" ? { priority: node.priority } : {}),
        ...(node.type === "folder" && node.structureSummary
          ? { structureSummary: node.structureSummary }
          : {}),
        ...(node.type === "module" && node.morphologySummary
          ? { morphologySummary: node.morphologySummary }
          : {}),
        ...(node.type === "module" && node.importsSummary
          ? { importsSummary: node.importsSummary }
          : {}),
        ...(node.type === "export" && node.morphologySummary
          ? { morphologySummary: node.morphologySummary }
          : {}),
      });
    }
  }

  return nodes;
}

function getDesc(node: AnyNode): string {
  if (node.type === "doc") {
    return node.explains || node.content.substring(0, 200).replace(/\s+/g, " ").trim();
  }
  return node.desc;
}

function getContent(node: AnyNode): string {
  if (node.type === "folder" && node.children) {
    const names = [
      ...node.children.folders.map((f) => f.name),
      ...node.children.files.map((f) => f.name),
    ];
    return names.join(" ");
  }
  if (node.type === "module") {
    const parts: string[] = [];
    if (node.morphology) parts.push(node.morphology.join(" "));
    if (node.imports) parts.push(node.imports.join(" "));
    return parts.join(" ");
  }
  if (node.type === "export" && node.morphology) {
    return node.morphology.join(" ");
  }
  return "";
}

function getPath(node: AnyNode): string {
  if ("resolvedPath" in node && node.resolvedPath) return node.resolvedPath;
  if ("filePath" in node) return node.filePath;
  if ("path" in node && node.path) return node.path;
  return "";
}
