import fs from "node:fs";
import path from "node:path";
import type { KnowledgeGraph, AnyNode, GraphEdge, FolderNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";

// --- Result types ---

interface NodeEdges {
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
}

interface DocRef {
  id: string;
  explains: string;
  filePath: string;
  excerpt: string;
}

interface FolderPickResult {
  type: "folder";
  resolvedVia: ResolvedVia;
  node: { id: string; desc: string; path?: string };
  parent?: { id: string; type: string; desc: string };
  childFolders: Array<{ id: string; desc: string; path?: string }>;
  modules: Array<{ id: string; desc: string; path?: string }>;
  exports: Array<{ id: string; desc: string; path?: string }>;
  referencingDocs: DocRef[];
}

interface ModulePickResult {
  type: "module";
  resolvedVia: ResolvedVia;
  node: { id: string; desc: string; typeSignature?: string; resolvedPath?: string };
  parentFolder?: { id: string; desc: string; path?: string };
  exports: Array<{ id: string; desc: string; typeSignature?: string }>;
  referencingDocs: DocRef[];
}

interface ExportPickResult {
  type: "export";
  resolvedVia: ResolvedVia;
  node: { id: string; desc: string; typeSignature?: string; resolvedPath?: string };
  parent?: { id: string; type: string; desc: string };
  referencingDocs: DocRef[];
}

interface TermPickResult {
  type: "term";
  resolvedVia: ResolvedVia;
  node: { id: string; desc: string };
  referencingDocs: DocRef[];
}

interface DocPickResult {
  type: "doc";
  resolvedVia: ResolvedVia;
  node: { id: string; explains: string; filePath: string; format: string; contentExcerpt: string };
  referencedNodes: Array<{ id: string; type: string; desc: string }>;
}

type PickResult =
  | FolderPickResult
  | ModulePickResult
  | ExportPickResult
  | TermPickResult
  | DocPickResult;
type ResolvedVia = "id" | "path" | "nearest-parent";

// --- Node resolution ---

interface ResolvedNode {
  id: string;
  node: AnyNode;
  resolvedVia: ResolvedVia;
}

function resolveNode(graph: KnowledgeGraph, identifier: string): ResolvedNode | null {
  // 1. Exact ID match across all dictionaries
  const dictionaries: Array<[string, Record<string, AnyNode>]> = [
    ["folders", graph.nodes.folders],
    ["modules", graph.nodes.modules],
    ["exports", graph.nodes.exports],
    ["terms", graph.nodes.terms],
    ["docs", graph.nodes.docs],
  ];

  for (const [, dict] of dictionaries) {
    if (dict[identifier]) {
      return { id: identifier, node: dict[identifier], resolvedVia: "id" };
    }
  }

  // 2. Path match — normalize and compare against node paths
  const normalized = normalizePath(identifier);

  for (const [id, folder] of Object.entries(graph.nodes.folders)) {
    if (folder.path && normalizePath(folder.path) === normalized) {
      return { id, node: folder, resolvedVia: "path" };
    }
  }

  for (const [id, mod] of Object.entries(graph.nodes.modules)) {
    if (mod.resolvedPath && normalizePath(mod.resolvedPath) === normalized) {
      return { id, node: mod, resolvedVia: "path" };
    }
  }

  for (const [id, exp] of Object.entries(graph.nodes.exports)) {
    if (exp.resolvedPath && normalizePath(exp.resolvedPath) === normalized) {
      return { id, node: exp, resolvedVia: "path" };
    }
  }

  for (const [id, doc] of Object.entries(graph.nodes.docs)) {
    if (normalizePath(doc.filePath) === normalized) {
      return { id, node: doc, resolvedVia: "path" };
    }
  }

  // 3. Nearest parent folder — deepest folder whose path is a prefix of the identifier
  let bestFolder: { id: string; node: FolderNode } | null = null;
  let bestLen = 0;

  for (const [id, folder] of Object.entries(graph.nodes.folders)) {
    if (!folder.path) continue;
    const folderPath = normalizePath(folder.path);
    if (
      (normalized.startsWith(folderPath + "/") || normalized === folderPath) &&
      folderPath.length > bestLen
    ) {
      bestFolder = { id, node: folder };
      bestLen = folderPath.length;
    }
  }

  if (bestFolder) {
    return { id: bestFolder.id, node: bestFolder.node, resolvedVia: "nearest-parent" };
  }

  return null;
}

function normalizePath(p: string): string {
  const posix = p.split(path.sep).join("/");
  const normalized = path.posix.normalize(posix);
  // Strip leading slash so absolute inputs become relative (graph paths are relative)
  if (path.posix.isAbsolute(normalized)) {
    return normalized.slice(1);
  }
  return normalized;
}

// --- Edge helpers ---

function getNodeEdges(allEdges: GraphEdge[], nodeId: string): NodeEdges {
  const incoming: GraphEdge[] = [];
  const outgoing: GraphEdge[] = [];
  for (const edge of allEdges) {
    if (edge.to === nodeId) incoming.push(edge);
    if (edge.from === nodeId) outgoing.push(edge);
  }
  return { incoming, outgoing };
}

const EXCERPT_LENGTH = 100;

function findReferencingDocs(edges: NodeEdges, graph: KnowledgeGraph): DocRef[] {
  const docs: DocRef[] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "references") {
      const doc = graph.nodes.docs[edge.from];
      if (doc) {
        const excerpt = doc.content.substring(0, EXCERPT_LENGTH).replace(/\s+/g, " ").trim();
        docs.push({
          id: edge.from,
          explains: doc.explains,
          filePath: doc.filePath,
          excerpt: excerpt + (doc.content.length > EXCERPT_LENGTH ? "..." : ""),
        });
      }
    }
  }
  return docs;
}

function findParent(
  edges: NodeEdges,
  graph: KnowledgeGraph
): { id: string; type: string; desc: string } | undefined {
  const parentEdge =
    edges.outgoing.find((e) => e.type === "belongs-to") ||
    edges.incoming.find((e) => e.type === "contains");

  if (!parentEdge) return undefined;

  const parentId = parentEdge.type === "belongs-to" ? parentEdge.to : parentEdge.from;
  const parentNode = graph.nodes.folders[parentId] || graph.nodes.modules[parentId];

  if (!parentNode) return undefined;

  return { id: parentId, type: parentNode.type, desc: parentNode.desc };
}

// --- Per-type resolvers ---

type NodeResolver<T extends PickResult = PickResult> = (
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
) => T;

function resolveFolder(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): FolderPickResult {
  const folder = node as import("../../core/graph/types.js").FolderNode;

  const parent = findParent(edges, graph);

  const childFolders: FolderPickResult["childFolders"] = [];
  for (const edge of edges.outgoing) {
    if (edge.type === "contains") {
      const child = graph.nodes.folders[edge.to];
      if (child) childFolders.push({ id: edge.to, desc: child.desc, path: child.path });
    }
  }

  const modules: FolderPickResult["modules"] = [];
  const exports: FolderPickResult["exports"] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const mod = graph.nodes.modules[edge.from];
      if (mod) {
        modules.push({ id: edge.from, desc: mod.desc, path: mod.resolvedPath });
        continue;
      }
      const exp = graph.nodes.exports[edge.from];
      if (exp) {
        exports.push({ id: edge.from, desc: exp.desc, path: exp.resolvedPath });
      }
    }
  }

  return {
    type: "folder",
    resolvedVia: "id", // placeholder, caller overwrites
    node: { id, desc: folder.desc, path: folder.path },
    parent,
    childFolders,
    modules,
    exports,
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveModule(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): ModulePickResult {
  const mod = node as import("../../core/graph/types.js").ModuleNode;

  // parent folder
  const parentEdge = edges.outgoing.find((e) => e.type === "belongs-to");
  let parentFolder: ModulePickResult["parentFolder"];
  if (parentEdge) {
    const folder = graph.nodes.folders[parentEdge.to];
    if (folder) parentFolder = { id: parentEdge.to, desc: folder.desc, path: folder.path };
  }

  // exports that belong to this module
  const exps: ModulePickResult["exports"] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const exp = graph.nodes.exports[edge.from];
      if (exp) exps.push({ id: edge.from, desc: exp.desc, typeSignature: exp.typeSignature });
    }
  }

  return {
    type: "module",
    resolvedVia: "id",
    node: { id, desc: mod.desc, typeSignature: mod.typeSignature, resolvedPath: mod.resolvedPath },
    parentFolder,
    exports: exps,
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveExport(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): ExportPickResult {
  const exp = node as import("../../core/graph/types.js").ExportNode;

  return {
    type: "export",
    resolvedVia: "id",
    node: { id, desc: exp.desc, typeSignature: exp.typeSignature, resolvedPath: exp.resolvedPath },
    parent: findParent(edges, graph),
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveTerm(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): TermPickResult {
  const term = node as import("../../core/graph/types.js").TermNode;

  return {
    type: "term",
    resolvedVia: "id",
    node: { id, desc: term.desc },
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveDoc(
  id: string,
  node: AnyNode,
  edges: NodeEdges,
  graph: KnowledgeGraph
): DocPickResult {
  const doc = node as import("../../core/graph/types.js").DocNode;

  const referencedNodes: DocPickResult["referencedNodes"] = [];
  for (const edge of edges.outgoing) {
    if (edge.type === "references") {
      const target =
        graph.nodes.folders[edge.to] ||
        graph.nodes.modules[edge.to] ||
        graph.nodes.exports[edge.to] ||
        graph.nodes.terms[edge.to];
      if (target) {
        referencedNodes.push({
          id: edge.to,
          type: target.type,
          desc: "desc" in target ? target.desc : "",
        });
      }
    }
  }

  const contentExcerpt =
    doc.content.substring(0, EXCERPT_LENGTH).replace(/\s+/g, " ").trim() +
    (doc.content.length > EXCERPT_LENGTH ? "..." : "");

  return {
    type: "doc",
    resolvedVia: "id",
    node: {
      id,
      explains: doc.explains,
      filePath: doc.filePath,
      format: doc.format,
      contentExcerpt,
    },
    referencedNodes,
  };
}

const resolvers: Record<string, NodeResolver> = {
  folder: resolveFolder as NodeResolver,
  module: resolveModule as NodeResolver,
  export: resolveExport as NodeResolver,
  term: resolveTerm as NodeResolver,
  doc: resolveDoc as NodeResolver,
};

// --- Public API ---

export async function pick(identifier: string): Promise<void> {
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);

  const resolved = resolveNode(graph, identifier);

  if (!resolved) {
    console.log(
      JSON.stringify(
        {
          error: "Node not found in graph",
          identifier,
          suggestion:
            "Use a valid node ID (folder, module, export, term, doc) or a filesystem path. Run `tskb ls` to see available folders.",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const resolver = resolvers[resolved.node.type];
  if (!resolver) {
    console.log(
      JSON.stringify(
        { error: "No resolver for node type", type: resolved.node.type, identifier },
        null,
        2
      )
    );
    process.exit(1);
  }

  const edges = getNodeEdges(graph.edges, resolved.id);
  const result = resolver(resolved.id, resolved.node, edges, graph);
  result.resolvedVia = resolved.resolvedVia;

  console.log(JSON.stringify(result, null, 2));
}
