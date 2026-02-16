import fs from "node:fs";
import type { KnowledgeGraph, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import {
  resolveNode,
  getNodeEdges,
  findReferencingDocs,
  findParent,
  type NodeEdges,
  type DocRef,
  type ResolvedVia,
} from "../utils/resolve-node.js";

// --- Result types ---

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
  node: { id: string; explains: string; filePath: string; format: string; priority: string };
  referencedNodes: Array<{ id: string; type: string; desc: string }>;
}

type PickResult =
  | FolderPickResult
  | ModulePickResult
  | ExportPickResult
  | TermPickResult
  | DocPickResult;

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

  return {
    type: "doc",
    resolvedVia: "id",
    node: {
      id,
      explains: doc.explains,
      filePath: doc.filePath,
      format: doc.format,
      priority: doc.priority,
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
