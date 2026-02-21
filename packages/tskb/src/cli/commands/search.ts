import fs from "node:fs";
import Fuse from "fuse.js";
import type { KnowledgeGraph, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time } from "../utils/logger.js";

interface SearchableNode {
  id: string;
  type: AnyNode["type"];
  desc: string;
  path: string;
  content: string; // children names (folders) or member names (modules) for deep matching
  priority?: string;
  structureSummary?: string;
  morphologySummary?: string;
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
  }>;
}

/**
 * Search the knowledge graph for nodes matching a fuzzy query.
 * Returns ranked results across all node types.
 */
export async function search(query: string): Promise<void> {
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
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
    useExtendedSearch: true,
  });

  // For multi-word queries, OR the words so partial matches surface
  const words = query.trim().split(/\s+/);
  const fuseQuery = words.length > 1 ? words.join(" | ") : query;
  const fuseResults = fuse.search(fuseQuery);

  // Boost results that contain an exact substring match of any query word
  const lowerWords = words.map((w) => w.toLowerCase());
  const boosted = fuseResults.map((r) => {
    const fields = [r.item.id, r.item.desc, r.item.path, r.item.content].map((f) =>
      f.toLowerCase()
    );
    const hasExact = lowerWords.some((w) => fields.some((f) => f.includes(w)));
    // Halve the score (lower = better in Fuse) for exact substring matches
    const boostedScore = hasExact ? (r.score ?? 1) * 0.5 : (r.score ?? 1);
    return { ...r, score: boostedScore };
  });
  boosted.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  const result: SearchResult = {
    query,
    results: boosted.slice(0, 10).map((r) => ({
      nodeId: r.item.id,
      type: r.item.type,
      desc: r.item.desc,
      path: r.item.path,
      score: Math.round((1 - (r.score ?? 1)) * 100) / 100,
      ...(r.item.priority ? { priority: r.item.priority } : {}),
      ...(r.item.structureSummary ? { structureSummary: r.item.structureSummary } : {}),
      ...(r.item.morphologySummary ? { morphologySummary: r.item.morphologySummary } : {}),
    })),
  };
  searchDone();

  verbose(`   ${fuseResults.length} raw matches, returning top ${result.results.length}`);

  console.log(JSON.stringify(result, null, 2));
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
        ...(node.type === "doc" ? { priority: node.priority } : {}),
        ...(node.type === "folder" && node.structureSummary
          ? { structureSummary: node.structureSummary }
          : {}),
        ...(node.type === "module" && node.morphologySummary
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
  if (node.type === "module" && node.morphology) {
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
