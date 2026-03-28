import fs from "node:fs";
import Fuse from "fuse.js";
import type { KnowledgeGraph, FlowNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time, jsonOut, plainOut } from "../utils/logger.js";

interface FlowEntry {
  nodeId: string;
  desc: string;
  priority: string;
  steps: Array<{ nodeId: string; order: number; label?: string }>;
}

interface FlowsResult {
  flows: FlowEntry[];
}

interface FlowsSearchResult {
  query: string;
  flows: (FlowEntry & { score: number })[];
}

const priorityOrder: Record<string, number> = { constraint: 0, essential: 1, supplementary: 2 };

function toEntry(id: string, flow: FlowNode): FlowEntry {
  return {
    nodeId: id,
    desc: flow.desc,
    priority: flow.priority,
    steps: flow.steps.map((s) => ({
      nodeId: s.nodeId,
      order: s.order,
      ...(s.label ? { label: s.label } : {}),
    })),
  };
}

/**
 * List all flows, optionally filtered by a fuzzy search query.
 * Results are sorted: constraints first, then essential, then supplementary.
 */
export async function flows(
  query?: string,
  optimized: boolean = false,
  plain: boolean = false
): Promise<void> {
  const loadDone = time("Loading graph");
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);
  loadDone();

  const allFlows = Object.entries(graph.nodes.flows).map(([id, flow]) => ({
    ...toEntry(id, flow),
    content: flow.steps.map((s) => `${s.nodeId}${s.label ? ` ${s.label}` : ""}`).join(" "),
  }));

  if (!query) {
    allFlows.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));
    const result: FlowsResult = {
      flows: allFlows.map(({ content: _, ...rest }) => rest),
    };
    verbose(`   ${allFlows.length} flows listed`);
    if (plain) {
      plainOut(formatFlowsListPlain(result));
    } else {
      jsonOut(result, optimized);
    }
    return;
  }

  const searchDone = time("Searching flows");
  const fuse = new Fuse(allFlows, {
    keys: [
      { name: "nodeId", weight: 0.3 },
      { name: "desc", weight: 0.4 },
      { name: "content", weight: 0.3 },
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
    const fields = [r.item.nodeId, r.item.desc, r.item.content].map((f) => f.toLowerCase());
    const hasExact = lowerWords.some((w) => fields.some((f) => f.includes(w)));
    let boostedScore = hasExact ? (r.score ?? 1) * 0.5 : (r.score ?? 1);
    if (r.item.priority === "essential") boostedScore *= 0.7;
    return { ...r, score: boostedScore };
  });
  boosted.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

  const result: FlowsSearchResult = {
    query,
    flows: boosted
      .map((r) => ({
        nodeId: r.item.nodeId,
        desc: r.item.desc,
        priority: r.item.priority,
        steps: r.item.steps,
        score: Math.round((1 - (r.score ?? 1)) * 100) / 100,
      }))
      .filter((f) => f.score > 0.2),
  };
  searchDone();

  verbose(`   ${fuseResults.length} raw matches, returning ${result.flows.length}`);

  if (plain) {
    plainOut(formatFlowsSearchPlain(result));
  } else {
    jsonOut(result, optimized);
  }
}

function formatFlowsListPlain(result: FlowsResult): string {
  if (result.flows.length === 0) return "Flows: 0 flows";

  const lines: string[] = [`Flows: ${result.flows.length} flows`, ""];

  for (const f of result.flows) {
    const steps = f.steps.map((s) => s.nodeId).join(" → ");
    lines.push(`  id: ${f.nodeId} [${f.priority}] — ${f.desc}`);
    lines.push(`     ${steps}`);
  }

  return lines.join("\n").trimEnd();
}

function formatFlowsSearchPlain(result: FlowsSearchResult): string {
  const lines: string[] = [`Flows: "${result.query}" — ${result.flows.length} results`, ""];

  for (const f of result.flows) {
    const steps = f.steps.map((s) => s.nodeId).join(" → ");
    lines.push(`  id: ${f.nodeId} [${f.priority}] [${f.score}] — ${f.desc}`);
    lines.push(`     ${steps}`);
  }

  return lines.join("\n").trimEnd();
}
