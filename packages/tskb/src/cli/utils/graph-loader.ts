import fs from "node:fs";
import path from "node:path";
import type {
  KnowledgeGraph,
  FolderNode,
  ModuleNode,
  ExportNode,
  TermNode,
  FileNode,
  ExternalNode,
  FlowNode,
  DocNode,
  GraphEdge,
} from "../../core/graph/types.js";
import { GRAPH_DIR_NAME } from "../../core/graph/writer.js";

export type GraphNodeType =
  | "folders"
  | "modules"
  | "exports"
  | "terms"
  | "files"
  | "externals"
  | "flows"
  | "docs"
  | "edges";

export const ALL_NODE_TYPES: GraphNodeType[] = [
  "folders",
  "modules",
  "exports",
  "terms",
  "files",
  "externals",
  "flows",
  "docs",
  "edges",
];

function findGraphDir(): string {
  const cwd = process.cwd();
  const graphDir = path.join(cwd, ".tskb", GRAPH_DIR_NAME);

  if (!fs.existsSync(path.join(graphDir, "meta.json"))) {
    throw new Error(
      `Graph files not found at ${graphDir}\n\n` +
        `Make sure you run 'tskb build' first to generate the knowledge graph.`
    );
  }

  return graphDir;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

export function loadGraph(types?: GraphNodeType[]): KnowledgeGraph {
  const graphDir = findGraphDir();
  const load = types === undefined;
  const wants = (t: GraphNodeType) => load || types.includes(t);

  const metadata = readJson<KnowledgeGraph["metadata"]>(path.join(graphDir, "meta.json"));

  return {
    metadata,
    nodes: {
      folders: wants("folders")
        ? readJson<Record<string, FolderNode>>(path.join(graphDir, "folders.json"))
        : {},
      modules: wants("modules")
        ? readJson<Record<string, ModuleNode>>(path.join(graphDir, "modules.json"))
        : {},
      exports: wants("exports")
        ? readJson<Record<string, ExportNode>>(path.join(graphDir, "exports.json"))
        : {},
      terms: wants("terms")
        ? readJson<Record<string, TermNode>>(path.join(graphDir, "terms.json"))
        : {},
      files: wants("files")
        ? readJson<Record<string, FileNode>>(path.join(graphDir, "files.json"))
        : {},
      externals: wants("externals")
        ? readJson<Record<string, ExternalNode>>(path.join(graphDir, "externals.json"))
        : {},
      flows: wants("flows")
        ? readJson<Record<string, FlowNode>>(path.join(graphDir, "flows.json"))
        : {},
      docs: wants("docs")
        ? readJson<Record<string, DocNode>>(path.join(graphDir, "docs.json"))
        : {},
    },
    edges: wants("edges") ? readJson<GraphEdge[]>(path.join(graphDir, "edges.json")) : [],
  };
}
