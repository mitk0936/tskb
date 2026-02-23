import fs from "node:fs";
import Fuse from "fuse.js";
import type { KnowledgeGraph } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time } from "../utils/logger.js";

interface DocEntry {
  nodeId: string;
  explains: string;
  filePath: string;
  priority: string;
}

interface DocsResult {
  docs: DocEntry[];
}

interface DocsSearchResult {
  query: string;
  docs: (DocEntry & { score: number })[];
}

interface SearchableDoc {
  nodeId: string;
  explains: string;
  filePath: string;
  priority: string;
  content: string;
}

/**
 * List all docs, optionally filtered by a fuzzy search query.
 * Results are sorted: constraints first, then essential, then supplementary.
 */
export async function docs(query?: string): Promise<void> {
  const loadDone = time("Loading graph");
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);
  loadDone();

  const allDocs: SearchableDoc[] = Object.entries(graph.nodes.docs).map(([id, doc]) => ({
    nodeId: id,
    explains: doc.explains,
    filePath: doc.filePath,
    priority: doc.priority,
    content: doc.content,
  }));

  const priorityOrder: Record<string, number> = { constraint: 0, essential: 1, supplementary: 2 };

  if (!query) {
    allDocs.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));
    const result: DocsResult = {
      docs: allDocs.map(({ content: _, ...rest }) => rest),
    };
    verbose(`   ${allDocs.length} docs listed`);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const searchDone = time("Searching docs");
  const fuse = new Fuse(allDocs, {
    keys: [
      { name: "nodeId", weight: 0.2 },
      { name: "explains", weight: 0.4 },
      { name: "content", weight: 0.3 },
      { name: "filePath", weight: 0.1 },
    ],
    threshold: 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeScore: true,
    useExtendedSearch: true,
  });

  const words = query.trim().split(/\s+/);
  const fuseQuery = words.length > 1 ? words.join(" | ") : query;
  const fuseResults = fuse.search(fuseQuery);

  const lowerWords = words.map((w) => w.toLowerCase());
  const boosted = fuseResults.map((r) => {
    const fields = [r.item.nodeId, r.item.explains, r.item.content, r.item.filePath].map((f) =>
      f.toLowerCase()
    );
    const hasExact = lowerWords.some((w) => fields.some((f) => f.includes(w)));
    let boostedScore = hasExact ? (r.score ?? 1) * 0.5 : (r.score ?? 1);
    if (r.item.priority === "essential") boostedScore *= 0.7;
    return { ...r, score: boostedScore };
  });
  boosted.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  const result: DocsSearchResult = {
    query,
    docs: boosted
      .map((r) => ({
        nodeId: r.item.nodeId,
        explains: r.item.explains,
        filePath: r.item.filePath,
        priority: r.item.priority,
        score: Math.round((1 - (r.score ?? 1)) * 100) / 100,
      }))
      .filter((d) => d.score > 0.2),
  };
  searchDone();

  verbose(`   ${fuseResults.length} raw matches, returning ${result.docs.length}`);

  console.log(JSON.stringify(result, null, 2));
}
