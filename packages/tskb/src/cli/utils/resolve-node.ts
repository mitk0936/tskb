import path from "node:path";
import type { KnowledgeGraph, AnyNode, GraphEdge, FolderNode } from "../../core/graph/types.js";

// --- Edge types ---

export interface NodeEdges {
  incoming: GraphEdge[];
  outgoing: GraphEdge[];
}

export interface DocRef {
  nodeId: string;
  explains: string;
  filePath: string;
  priority: string;
}

// --- Node resolution ---

export type ResolvedVia = "id" | "path" | "nearest-parent";

export interface ResolvedNode {
  id: string;
  node: AnyNode;
  resolvedVia: ResolvedVia;
}

export function resolveNode(graph: KnowledgeGraph, identifier: string): ResolvedNode | null {
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

// --- Edge helpers ---

export function getNodeEdges(allEdges: GraphEdge[], nodeId: string): NodeEdges {
  const incoming: GraphEdge[] = [];
  const outgoing: GraphEdge[] = [];
  for (const edge of allEdges) {
    if (edge.to === nodeId) incoming.push(edge);
    if (edge.from === nodeId) outgoing.push(edge);
  }
  return { incoming, outgoing };
}

export function findReferencingDocs(edges: NodeEdges, graph: KnowledgeGraph): DocRef[] {
  const docs: DocRef[] = [];
  for (const edge of edges.incoming) {
    if (edge.type === "references") {
      const doc = graph.nodes.docs[edge.from];
      if (doc) {
        docs.push({
          nodeId: edge.from,
          explains: doc.explains,
          filePath: doc.filePath,
          priority: doc.priority,
        });
      }
    }
  }
  return docs;
}

export function findParent(
  edges: NodeEdges,
  graph: KnowledgeGraph
): { nodeId: string; type: string; desc: string } | undefined {
  const parentEdge =
    edges.outgoing.find((e) => e.type === "belongs-to") ||
    edges.incoming.find((e) => e.type === "contains");

  if (!parentEdge) return undefined;

  const parentId = parentEdge.type === "belongs-to" ? parentEdge.to : parentEdge.from;
  const parentNode = graph.nodes.folders[parentId] || graph.nodes.modules[parentId];

  if (!parentNode) return undefined;

  return { nodeId: parentId, type: parentNode.type, desc: parentNode.desc };
}

function normalizePath(p: string): string {
  const posix = p.split(path.sep).join("/");
  const normalized = path.posix.normalize(posix);
  if (path.posix.isAbsolute(normalized)) {
    return normalized.slice(1);
  }
  return normalized;
}
