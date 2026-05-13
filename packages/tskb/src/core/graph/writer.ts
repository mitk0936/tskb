import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph, AnyNode } from "./types.js";

export const GRAPH_DIR_NAME = "graph";

function compact(obj: unknown): string {
  return JSON.stringify(obj);
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getNodeContent(node: AnyNode): string {
  if (node.type === "doc") {
    return stripHtml(node.content).substring(0, 400);
  }
  if (node.type === "flow") {
    return node.steps.map((s) => `${s.nodeId}${s.label ? ` ${s.label}` : ""}`).join(" ");
  }
  if (node.type === "module") {
    const parts: string[] = [];
    if (node.morphologySummary) parts.push(node.morphologySummary);
    if (node.importsSummary) parts.push(node.importsSummary);
    return parts.join(" ");
  }
  if (node.type === "export" && node.morphologySummary) {
    return node.morphologySummary;
  }
  if (node.type === "folder" && node.children) {
    const names = [
      ...node.children.folders.map((f) => f.name),
      ...node.children.files.map((f) => f.name),
    ];
    return node.boundary ? `${node.boundary} ${names.join(" ")}` : names.join(" ");
  }
  return "";
}

function buildSearchIndex(graph: KnowledgeGraph): SearchIndexEntry[] {
  const entries: SearchIndexEntry[] = [];

  const add = (node: AnyNode) => {
    entries.push({
      id: node.id,
      type: node.type,
      label: node.id.split(".").pop() ?? node.id,
      desc: node.type === "doc" ? (node.explains ?? "") : (("desc" in node ? node.desc : "") ?? ""),
      path:
        ("path" in node ? node.path : undefined) ??
        ("resolvedPath" in node ? node.resolvedPath : undefined),
      content: getNodeContent(node),
      edgeCount: node.edgeCount ?? 0,
    });
  };

  for (const n of Object.values(graph.nodes.folders)) add(n);
  for (const n of Object.values(graph.nodes.modules)) add(n);
  for (const n of Object.values(graph.nodes.exports)) add(n);
  for (const n of Object.values(graph.nodes.terms)) add(n);
  for (const n of Object.values(graph.nodes.files)) add(n);
  for (const n of Object.values(graph.nodes.externals)) add(n);
  for (const n of Object.values(graph.nodes.flows)) add(n);
  for (const n of Object.values(graph.nodes.docs)) add(n);

  return entries;
}

export interface SearchIndexEntry {
  id: string;
  type: AnyNode["type"];
  label: string;
  desc: string;
  path?: string;
  content: string;
  edgeCount: number;
}

export function writeSplitGraph(graph: KnowledgeGraph, outputDir: string): string {
  const graphDir = path.join(outputDir, GRAPH_DIR_NAME);
  fs.mkdirSync(graphDir, { recursive: true });

  fs.writeFileSync(path.join(graphDir, "meta.json"), compact(graph.metadata), "utf-8");
  fs.writeFileSync(path.join(graphDir, "folders.json"), compact(graph.nodes.folders), "utf-8");
  fs.writeFileSync(path.join(graphDir, "modules.json"), compact(graph.nodes.modules), "utf-8");
  fs.writeFileSync(path.join(graphDir, "exports.json"), compact(graph.nodes.exports), "utf-8");
  fs.writeFileSync(path.join(graphDir, "terms.json"), compact(graph.nodes.terms), "utf-8");
  fs.writeFileSync(path.join(graphDir, "files.json"), compact(graph.nodes.files), "utf-8");
  fs.writeFileSync(path.join(graphDir, "externals.json"), compact(graph.nodes.externals), "utf-8");
  fs.writeFileSync(path.join(graphDir, "flows.json"), compact(graph.nodes.flows), "utf-8");
  fs.writeFileSync(path.join(graphDir, "docs.json"), compact(graph.nodes.docs), "utf-8");
  fs.writeFileSync(path.join(graphDir, "edges.json"), compact(graph.edges), "utf-8");
  fs.writeFileSync(
    path.join(graphDir, "search-index.json"),
    compact(buildSearchIndex(graph)),
    "utf-8"
  );

  return graphDir;
}
