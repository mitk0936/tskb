import fs from "node:fs";
import type { KnowledgeGraph, GraphEdge, AnyNode } from "../../core/graph/types.js";
import { findGraphFile } from "../utils/graph-finder.js";
import { verbose, time, jsonOut } from "../utils/logger.js";
import {
  resolveNode,
  getNodeEdges,
  findReferencingDocs,
  type DocRef,
  type ResolvedVia,
} from "../utils/resolve-node.js";

// --- Result types ---

interface ContextNode {
  nodeId: string;
  type: AnyNode["type"];
  desc: string;
  path?: string;
  structureSummary?: string;
  morphologySummary?: string;
  depth: number;
}

interface ContextDoc {
  nodeId: string;
  explains: string;
  priority: string;
  filePath: string;
}

interface ContextResult {
  root: {
    nodeId: string;
    type: AnyNode["type"];
    desc: string;
    path?: string;
    structureSummary?: string;
    morphologySummary?: string;
    resolvedVia: ResolvedVia;
  };
  nodes: ContextNode[];
  docs: ContextDoc[];
  constraints: string[];
}

// --- Traversal ---

/**
 * Build a lookup from node ID → connected node IDs for graph traversal.
 * Covers structural edges (contains, belongs-to) and graph edges (imports, related-to).
 * Both directions are indexed so traversal works regardless of starting node type.
 */
function buildNeighborIndex(edges: GraphEdge[]): Map<string, string[]> {
  const index = new Map<string, string[]>();

  function addEntry(from: string, to: string) {
    let neighbors = index.get(from);
    if (!neighbors) {
      neighbors = [];
      index.set(from, neighbors);
    }
    neighbors.push(to);
  }

  for (const edge of edges) {
    if (edge.type === "contains") {
      // folder → child folder (both directions for traversal)
      addEntry(edge.from, edge.to);
      addEntry(edge.to, edge.from);
    } else if (edge.type === "belongs-to") {
      // module/export/file → parent folder/module (both directions)
      addEntry(edge.to, edge.from);
      addEntry(edge.from, edge.to);
    } else if (edge.type === "imports") {
      // module → module/folder (both directions)
      addEntry(edge.from, edge.to);
      addEntry(edge.to, edge.from);
    } else if (edge.type === "related-to") {
      // any → any (both directions)
      addEntry(edge.from, edge.to);
      addEntry(edge.to, edge.from);
    }
    // skip "references" — doc edges are collected separately via findReferencingDocs
  }

  return index;
}

function findNode(graph: KnowledgeGraph, id: string): AnyNode | undefined {
  return (
    graph.nodes.folders[id] ||
    graph.nodes.modules[id] ||
    graph.nodes.exports[id] ||
    graph.nodes.files[id] ||
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
  if (node.type === "file") return node.path;
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

  // BFS traversal across all edge types
  const neighborIndex = buildNeighborIndex(graph.edges);
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
        nodeId: id,
        type: node.type,
        desc: getNodeDesc(node),
        path: getNodePath(node),
        ...(node.type === "folder" && node.structureSummary
          ? { structureSummary: node.structureSummary }
          : {}),
        ...(node.type === "module" && node.morphologySummary
          ? { morphologySummary: node.morphologySummary }
          : {}),
        depth,
      });
    }

    // Collect referencing docs for this node
    const edges = getNodeEdges(graph.edges, id);
    const docRefs = findReferencingDocs(edges, graph);
    for (const docRef of docRefs) {
      if (!docMap.has(docRef.nodeId)) {
        docMap.set(docRef.nodeId, {
          nodeId: docRef.nodeId,
          explains: docRef.explains,
          priority: docRef.priority,
          filePath: docRef.filePath,
        });
        if (docRef.priority === "constraint") {
          constraints.push(docRef.nodeId);
        }
      }
    }

    // Enqueue neighbors if within depth
    if (depth < maxDepth) {
      const neighbors = neighborIndex.get(id);
      if (neighbors) {
        for (const neighborId of neighbors) {
          if (!visited.has(neighborId)) {
            queue.push({ id: neighborId, depth: depth + 1 });
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

export async function context(
  identifier: string,
  depth: number = 1,
  optimized: boolean = false
): Promise<void> {
  const loadDone = time("Loading graph");
  const graphPath = findGraphFile();
  const graphJson = fs.readFileSync(graphPath, "utf-8");
  const graph: KnowledgeGraph = JSON.parse(graphJson);
  loadDone();

  const traverseDone = time("Building context");
  const resolved = resolveNode(graph, identifier);

  if (!resolved) {
    console.log(
      JSON.stringify(
        {
          error: "Node not found in graph",
          identifier,
          suggestion:
            "Use a valid node ID (folder, module, export, file, term, doc) or a filesystem path. Run `tskb ls` to see available folders.",
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
      nodeId: resolved.id,
      type: rootNode.type,
      desc: getNodeDesc(rootNode),
      path: getNodePath(rootNode),
      ...(rootNode.type === "folder" && rootNode.structureSummary
        ? { structureSummary: rootNode.structureSummary }
        : {}),
      ...(rootNode.type === "module" && rootNode.morphologySummary
        ? { morphologySummary: rootNode.morphologySummary }
        : {}),
      resolvedVia: resolved.resolvedVia,
    },
    nodes,
    docs,
    constraints,
  };
  traverseDone();

  verbose(
    `   Resolved "${identifier}" via ${resolved.resolvedVia} → ${resolved.node.type} "${resolved.id}"`
  );
  verbose(
    `   ${nodes.length} nodes, ${docs.length} docs, ${constraints.length} constraints (depth=${depth})`
  );

  jsonOut(result, optimized);
}
