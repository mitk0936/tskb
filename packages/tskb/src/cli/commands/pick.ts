import fs from "node:fs";
import type { KnowledgeGraph, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time } from "../utils/logger.js";
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
  node: {
    nodeId: string;
    desc: string;
    path?: string;
    structureSummary?: string;
    children?: import("../../core/graph/types.js").FolderNode["children"];
  };
  parent?: { nodeId: string; type: string; desc: string };
  exports: Array<{ nodeId: string; desc: string; path?: string }>;
  referencingDocs: DocRef[];
}

interface ModulePickResult {
  type: "module";
  resolvedVia: ResolvedVia;
  node: {
    nodeId: string;
    desc: string;
    typeSignature?: string;
    resolvedPath?: string;
    morphologySummary?: string;
    morphology?: string[];
  };
  parentFolder?: { nodeId: string; desc: string; path?: string };
  exports: Array<{ nodeId: string; desc: string; typeSignature?: string }>;
  referencingDocs: DocRef[];
}

interface ExportPickResult {
  type: "export";
  resolvedVia: ResolvedVia;
  node: { nodeId: string; desc: string; typeSignature?: string; resolvedPath?: string };
  parent?: { nodeId: string; type: string; desc: string };
  referencingDocs: DocRef[];
}

interface TermPickResult {
  type: "term";
  resolvedVia: ResolvedVia;
  node: { nodeId: string; desc: string };
  referencingDocs: DocRef[];
}

interface DocPickResult {
  type: "doc";
  resolvedVia: ResolvedVia;
  node: {
    nodeId: string;
    explains: string;
    filePath: string;
    format: string;
    priority: string;
    content: string;
  };
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

  // Collect exports that belong directly to this folder (not via a module)
  const exports: FolderPickResult["exports"] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const exp = graph.nodes.exports[edge.from];
      if (exp) {
        exports.push({ nodeId: edge.from, desc: exp.desc, path: exp.resolvedPath });
      }
    }
  }

  return {
    type: "folder",
    resolvedVia: "id", // placeholder, caller overwrites
    node: {
      nodeId: id,
      desc: folder.desc,
      path: folder.path,
      ...(folder.structureSummary ? { structureSummary: folder.structureSummary } : {}),
      ...(folder.children ? { children: folder.children } : {}),
    },
    parent,
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
    if (folder) parentFolder = { nodeId: parentEdge.to, desc: folder.desc, path: folder.path };
  }

  // exports that belong to this module
  const exps: ModulePickResult["exports"] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "belongs-to") {
      const exp = graph.nodes.exports[edge.from];
      if (exp) exps.push({ nodeId: edge.from, desc: exp.desc, typeSignature: exp.typeSignature });
    }
  }

  return {
    type: "module",
    resolvedVia: "id",
    node: {
      nodeId: id,
      desc: mod.desc,
      typeSignature: mod.typeSignature,
      resolvedPath: mod.resolvedPath,
      ...(mod.morphologySummary ? { morphologySummary: mod.morphologySummary } : {}),
      ...(mod.morphology ? { morphology: mod.morphology } : {}),
    },
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
    node: {
      nodeId: id,
      desc: exp.desc,
      typeSignature: exp.typeSignature,
      resolvedPath: exp.resolvedPath,
    },
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
    node: { nodeId: id, desc: term.desc },
    referencingDocs: findReferencingDocs(edges, graph),
  };
}

function resolveDoc(
  id: string,
  node: AnyNode,
  _edges: NodeEdges,
  _graph: KnowledgeGraph
): DocPickResult {
  const doc = node as import("../../core/graph/types.js").DocNode;

  return {
    type: "doc",
    resolvedVia: "id",
    node: {
      nodeId: id,
      explains: doc.explains,
      filePath: doc.filePath,
      format: doc.format,
      priority: doc.priority,
      content: doc.content,
    },
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
  const loadDone = time("Loading graph");
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);
  loadDone();

  const resolveDone = time("Resolving node");
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
  resolveDone();

  verbose(
    `   Resolved "${identifier}" via ${resolved.resolvedVia} → ${resolved.node.type} "${resolved.id}"`
  );

  console.log(JSON.stringify(result, null, 2));
}
