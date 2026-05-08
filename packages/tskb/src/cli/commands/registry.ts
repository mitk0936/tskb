import fs from "node:fs";
import Fuse from "fuse.js";
import type { KnowledgeGraph, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time, jsonOut, plainOut, error } from "../utils/logger.js";

type RegistryKind = "folder" | "module" | "export" | "file" | "external" | "term";

const VALID_KINDS: RegistryKind[] = ["folder", "module", "export", "file", "external", "term"];

const SAMPLE_SIZE = 5;

interface RegistryEntry {
  nodeId: string;
  kind: RegistryKind;
  desc: string;
  path?: string;
}

interface SearchableEntry extends RegistryEntry {
  /** Combined extra text for fuzzy matching (morphology, externals metadata, etc.) */
  content: string;
}

interface RegistryListResult {
  type?: RegistryKind;
  query?: string;
  nodes: (RegistryEntry & { score?: number })[];
}

interface RegistryOverviewResult {
  counts: Record<RegistryKind, number>;
  samples: Record<RegistryKind, RegistryEntry[]>;
}

function getPath(node: AnyNode): string | undefined {
  if ("resolvedPath" in node && node.resolvedPath) return node.resolvedPath;
  if ("path" in node && node.path) return node.path;
  return undefined;
}

function getContent(node: AnyNode): string {
  if (node.type === "module") {
    const parts: string[] = [];
    if (node.morphology) parts.push(node.morphology.join(" "));
    if (node.morphologySummary) parts.push(node.morphologySummary);
    return parts.join(" ");
  }
  if (node.type === "export") {
    const parts: string[] = [];
    if (node.morphology) parts.push(node.morphology.join(" "));
    if (node.morphologySummary) parts.push(node.morphologySummary);
    return parts.join(" ");
  }
  if (node.type === "external" && node.metadata) {
    return Object.entries(node.metadata)
      .map(([k, v]) => `${k}: ${v}`)
      .join(" ");
  }
  return "";
}

function collectByKind(graph: KnowledgeGraph): Record<RegistryKind, SearchableEntry[]> {
  const out: Record<RegistryKind, SearchableEntry[]> = {
    folder: [],
    module: [],
    export: [],
    file: [],
    external: [],
    term: [],
  };

  const sources: Array<[RegistryKind, Record<string, AnyNode>]> = [
    ["folder", graph.nodes.folders],
    ["module", graph.nodes.modules],
    ["export", graph.nodes.exports],
    ["file", graph.nodes.files],
    ["external", graph.nodes.externals],
    ["term", graph.nodes.terms],
  ];

  for (const [kind, dict] of sources) {
    for (const [id, node] of Object.entries(dict)) {
      const path = getPath(node);
      out[kind].push({
        nodeId: id,
        kind,
        desc: "desc" in node ? node.desc : "",
        ...(path ? { path } : {}),
        content: getContent(node),
      });
    }
  }

  for (const k of VALID_KINDS) {
    out[k].sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  }

  return out;
}

function stripContent(e: SearchableEntry): RegistryEntry {
  const { content: _content, ...rest } = e;
  return rest;
}

/**
 * List or search the registry — folders, modules, exports, files, externals,
 * and terms. Designed for doc authors who need to discover what already
 * exists before declaring something new (reuse a Term, link to a known
 * External, find sibling Modules in an area).
 *
 * - No args: overview with counts and a sample of each kind.
 * - `<query>`: fuzzy across nodeId, desc, path, and content (morphology / external metadata).
 * - `--type=<kind>`: scope listing or search to one kind.
 */
export async function registry(
  query: string | undefined,
  options: { type?: string },
  optimized: boolean,
  plain: boolean
): Promise<void> {
  if (options.type && !VALID_KINDS.includes(options.type as RegistryKind)) {
    error(`Error: --type must be one of: ${VALID_KINDS.join(", ")}`);
    process.exit(1);
  }

  const loadDone = time("Loading graph");
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);
  loadDone();

  const byKind = collectByKind(graph);
  const kind = options.type as RegistryKind | undefined;

  // Overview mode: no query, no type — counts + samples
  if (!query && !kind) {
    const counts = Object.fromEntries(VALID_KINDS.map((k) => [k, byKind[k].length])) as Record<
      RegistryKind,
      number
    >;
    const samples = Object.fromEntries(
      VALID_KINDS.map((k) => [k, byKind[k].slice(0, SAMPLE_SIZE).map(stripContent)])
    ) as Record<RegistryKind, RegistryEntry[]>;

    const result: RegistryOverviewResult = { counts, samples };
    verbose(
      `   ${Object.values(counts).reduce((a, b) => a + b, 0)} nodes across ${VALID_KINDS.length} kinds`
    );
    if (plain) plainOut(formatOverviewPlain(result));
    else jsonOut(result, optimized);
    return;
  }

  // Determine the pool: one kind, or all kinds combined
  const pool: SearchableEntry[] = kind ? byKind[kind] : VALID_KINDS.flatMap((k) => byKind[k]);

  // No query: list everything in the pool
  if (!query) {
    const result: RegistryListResult = {
      ...(kind ? { type: kind } : {}),
      nodes: pool.map(stripContent),
    };
    verbose(`   ${pool.length} ${kind ?? "node"}${pool.length === 1 ? "" : "s"} listed`);
    if (plain) plainOut(formatListPlain(result));
    else jsonOut(result, optimized);
    return;
  }

  // Fuzzy search the pool
  const searchDone = time("Searching registry");
  const fuse = new Fuse(pool, {
    keys: [
      { name: "nodeId", weight: 0.4 },
      { name: "desc", weight: 0.3 },
      { name: "path", weight: 0.15 },
      { name: "content", weight: 0.15 },
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
  const scored = fuseResults.map((r) => {
    const fields = [r.item.nodeId, r.item.desc, r.item.path ?? "", r.item.content].map((f) =>
      f.toLowerCase()
    );
    const hasExact = lowerWords.some((w) => fields.some((f) => f.includes(w)));
    const score = hasExact ? (r.score ?? 1) * 0.5 : (r.score ?? 1);
    return { item: r.item, score };
  });

  scored.sort((a, b) => a.score - b.score);

  const result: RegistryListResult = {
    ...(kind ? { type: kind } : {}),
    query,
    nodes: scored
      .map((r) => ({
        ...stripContent(r.item),
        score: Math.round((1 - r.score) * 100) / 100,
      }))
      .filter((r) => (r.score ?? 0) > 0.2),
  };
  searchDone();

  verbose(`   ${fuseResults.length} raw matches, returning ${result.nodes.length}`);

  if (plain) plainOut(formatListPlain(result));
  else jsonOut(result, optimized);
}

function formatOverviewPlain(result: RegistryOverviewResult): string {
  const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
  const lines: string[] = [`Registry overview: ${total} nodes`, ""];

  for (const kind of VALID_KINDS) {
    const count = result.counts[kind];
    const samples = result.samples[kind];
    lines.push(`  ${kind}s: ${count}`);
    for (const s of samples) {
      lines.push(`    ${s.nodeId} — ${s.desc}`);
    }
    if (count > samples.length) {
      lines.push(`    ... ${count - samples.length} more (use --type=${kind} to list all)`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

function formatListPlain(result: RegistryListResult): string {
  const parts: string[] = [];
  if (result.type) parts.push(`${result.type}s`);
  if (result.query) parts.push(`matching "${result.query}"`);
  const filter = parts.length > 0 ? ` — ${parts.join(" ")}` : "";

  const header = `Registry: ${result.nodes.length} ${result.nodes.length === 1 ? "node" : "nodes"}${filter}`;
  if (result.nodes.length === 0) return header;

  const lines: string[] = [header, ""];
  for (const n of result.nodes) {
    const score = n.score !== undefined ? ` [${n.score}]` : "";
    const pathSuffix = n.path ? ` (${n.path})` : "";
    lines.push(`  ${n.nodeId} (${n.kind})${score}${pathSuffix}`);
    lines.push(`    ${n.desc}`);
  }
  return lines.join("\n").trimEnd();
}
