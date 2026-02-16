import fs from "node:fs";
import type { KnowledgeGraph, GraphEdge, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import {
  resolveNode,
  getNodeEdges,
  findReferencingDocs,
  type DocRef,
  type ResolvedVia,
} from "../utils/resolve-node.js";

// --- Result types ---

interface ContextNode {
  id: string;
  type: AnyNode["type"];
  desc: string;
  path?: string;
  depth: number;
}

interface ContextDoc {
  id: string;
  explains: string;
  priority: string;
  filePath: string;
  content: string;
}

interface ContextResult {
  root: {
    id: string;
    type: AnyNode["type"];
    desc: string;
    path?: string;
    resolvedVia: ResolvedVia;
  };
  nodes: ContextNode[];
  docs: ContextDoc[];
  constraints: string[];
}

// --- Traversal ---

/**
 * Build a lookup from parent ID → child IDs for structural edges.
 * Covers both "contains" (folder→folder) and "belongs-to" (module/export→folder/module).
 */
function buildChildIndex(edges: GraphEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const edge of edges) {
    // "contains": parent is `from`, child is `to`
    if (edge.type === "contains") {
      let children = index.get(edge.from);
      if (!children) {
        children = [];
        index.set(edge.from, children);
      }
      children.push(edge.to);
    }
    // "belongs-to": child is `from`, parent is `to`
    if (edge.type === "belongs-to") {
      let children = index.get(edge.to);
      if (!children) {
        children = [];
        index.set(edge.to, children);
      }
      children.push(edge.from);
    }
  }

  return index;
}

function findNode(graph: KnowledgeGraph, id: string): AnyNode | undefined {
  return (
    graph.nodes.folders[id] ||
    graph.nodes.modules[id] ||
    graph.nodes.exports[id] ||
    graph.nodes.terms[id] ||
    graph.nodes.docs[id]
  );
}

function getNodeDesc(node: AnyNode): string {
  if (node.type === "doc") return node.explains;
  return node.desc;
}

function getNodePath(node: AnyNode): string | undefined {
  if (node.type === "folder") return node.path;
  if (node.type === "module" || node.type === "export") return node.resolvedPath;
  if (node.type === "doc") return node.filePath;
  return undefined;
}

function buildContext(
  graph: KnowledgeGraph,
  startId: string,
  maxDepth: number
): { nodes: ContextNode[]; docs: ContextDoc[]; constraints: string[] } {
  const visited = new Set<string>();
  const collectedNodes: ContextNode[] = [];
  const docMap = new Map<string, ContextDoc>();
  const constraints: string[] = [];

  // BFS traversal
  const childIndex = buildChildIndex(graph.edges);
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = findNode(graph, id);
    if (!node || node.type === "doc") continue;

    // Collect node (skip root at depth 0 — it goes in root field)
    if (depth > 0) {
      collectedNodes.push({
        id,
        type: node.type,
        desc: getNodeDesc(node),
        path: getNodePath(node),
        depth,
      });
    }

    // Collect referencing docs for this node
    const edges = getNodeEdges(graph.edges, id);
    const docs = findReferencingDocs(edges, graph);
    for (const doc of docs) {
      if (!docMap.has(doc.id)) {
        docMap.set(doc.id, {
          id: doc.id,
          explains: doc.explains,
          priority: doc.priority,
          filePath: doc.filePath,
          content: doc.content,
        });
        if (doc.priority === "constraint") {
          constraints.push(doc.id);
        }
      }
    }

    // Enqueue children if within depth
    if (depth < maxDepth) {
      const children = childIndex.get(id);
      if (children) {
        for (const childId of children) {
          if (!visited.has(childId)) {
            queue.push({ id: childId, depth: depth + 1 });
          }
        }
      }
    }
  }

  // Sort: constraints first, then essential, then supplementary
  const priorityOrder: Record<string, number> = { constraint: 0, essential: 1, supplementary: 2 };
  const docs = Array.from(docMap.values()).sort(
    (a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3)
  );

  return { nodes: collectedNodes, docs, constraints };
}

// --- Public API ---

export async function context(identifier: string, depth: number = 1): Promise<void> {
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

  const rootNode = resolved.node;
  const { nodes, docs, constraints } = buildContext(graph, resolved.id, depth);

  const result: ContextResult = {
    root: {
      id: resolved.id,
      type: rootNode.type,
      desc: getNodeDesc(rootNode),
      path: getNodePath(rootNode),
      resolvedVia: resolved.resolvedVia,
    },
    nodes,
    docs,
    constraints,
  };

  console.log(JSON.stringify(result, null, 2));
}
