import fs from "node:fs";
import Fuse from "fuse.js";
import type { KnowledgeGraph, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";

interface SearchableNode {
  id: string;
  type: AnyNode["type"];
  desc: string;
  path: string;
  priority?: string;
}

interface SearchResult {
  query: string;
  results: Array<{
    id: string;
    type: string;
    desc: string;
    path: string;
    score: number;
    priority?: string;
  }>;
}

/**
 * Search the knowledge graph for nodes matching a fuzzy query.
 * Returns ranked results across all node types.
 */
export async function search(query: string): Promise<void> {
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  const nodes = buildSearchableNodes(graph);

  const fuse = new Fuse(nodes, {
    keys: [
      { name: "id", weight: 0.4 },
      { name: "desc", weight: 0.3 },
      { name: "path", weight: 0.3 },
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
    const fields = [r.item.id, r.item.desc, r.item.path].map((f) => f.toLowerCase());
    const hasExact = lowerWords.some((w) => fields.some((f) => f.includes(w)));
    // Halve the score (lower = better in Fuse) for exact substring matches
    const boostedScore = hasExact ? (r.score ?? 1) * 0.5 : (r.score ?? 1);
    return { ...r, score: boostedScore };
  });
  boosted.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  const result: SearchResult = {
    query,
    results: boosted.slice(0, 10).map((r) => ({
      id: r.item.id,
      type: r.item.type,
      desc: r.item.desc,
      path: r.item.path,
      score: Math.round((1 - (r.score ?? 1)) * 100) / 100,
      ...(r.item.priority ? { priority: r.item.priority } : {}),
    })),
  };

  const output = { rootPath: graph.metadata.rootPath, ...result };
  console.log(JSON.stringify(output, null, 2));
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
        ...(node.type === "doc" ? { priority: node.priority } : {}),
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

function getPath(node: AnyNode): string {
  if ("resolvedPath" in node && node.resolvedPath) return node.resolvedPath;
  if ("filePath" in node) return node.filePath;
  if ("path" in node && node.path) return node.path;
  return "";
}
