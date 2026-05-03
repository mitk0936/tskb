import * as d3 from "d3";
import type { ExplorerNode, PositionedNode, NodeType } from "../types";
import { isGhost, hasChildren, childCount } from "../types";
import type { GraphStore } from "../store/graph-store";

// ─── Constants ───────────────────────────────────────────────────────────────

export const NODE_SIZES: Record<NodeType, { w: number; h: number }> = {
  folder: { w: 190, h: 52 },
  module: { w: 165, h: 48 },
  export: { w: 145, h: 40 },
  doc: { w: 165, h: 48 },
  flow: { w: 165, h: 48 },
  term: { w: 145, h: 40 },
  external: { w: 145, h: 40 },
  file: { w: 130, h: 38 },
};

export function nodeSize(node: PositionedNode): { w: number; h: number } {
  if (isGhost(node)) {
    const base = NODE_SIZES[node.type] ?? NODE_SIZES.module;
    return { w: Math.min(base.w, 130), h: 22 };
  }
  return NODE_SIZES[node.type] ?? NODE_SIZES.module;
}

const LANE_PADDING = 40;
const LANE_GAP = 64;
const LANE_HEADER_H = 28;
const H_GAP = 60; // horizontal gap between depth columns
const V_GAP = 18; // vertical gap between siblings

// ─── Tree data helper ─────────────────────────────────────────────────────────

interface TreeData extends ExplorerNode {
  treeChildren?: TreeData[];
}

function buildStructureTree(store: GraphStore, expanded: ReadonlySet<string>): TreeData | null {
  if (!store.meta) return null;
  return {
    ...store.meta.root,
    treeChildren: buildFolderChildren(store.meta.topFolders, store, expanded),
  };
}

/** Build flat list of export nodes belonging to parentId. */
function buildExportTree(parentId: string, allExports: ExplorerNode[]): TreeData[] {
  return allExports
    .filter((e) => e.parentId === parentId && e.id !== parentId)
    .map((e) => ({ ...e }));
}

function makeGhostNodes(parentId: string, count: number, type: NodeType = "module"): TreeData[] {
  return Array.from({ length: Math.min(count, 4) }, (_, i) => ({
    id: `${parentId}:ghost:${i}`,
    type,
    label: "",
    description: "",
    edgeCount: 0,
    parentId,
    detail: { _ghost: "true" },
  }));
}

function buildFolderChildren(
  folders: ExplorerNode[],
  store: GraphStore,
  expanded: ReadonlySet<string>
): TreeData[] {
  return folders.map((folder) => {
    if (!expanded.has(folder.id)) {
      const count = childCount(folder);
      if (count > 0) return { ...folder, treeChildren: makeGhostNodes(folder.id, count) };
      return { ...folder };
    }
    const chunk = store.folderChunks.get(folder.id);
    if (!chunk) return { ...folder };

    const children: TreeData[] = [];

    // Sub-folders first (recursively)
    if (chunk.subfolders?.length) {
      children.push(...buildFolderChildren(chunk.subfolders, store, expanded));
    }

    // Modules
    for (const mod of chunk.modules) {
      if (!expanded.has(mod.id)) {
        if (hasChildren(mod)) {
          const exportCount = chunk.exports.filter((e) => e.parentId === mod.id).length;
          children.push({ ...mod, treeChildren: makeGhostNodes(mod.id, exportCount, "export") });
        } else {
          children.push({ ...mod });
        }
      } else {
        children.push({
          ...mod,
          treeChildren: buildExportTree(mod.id, chunk.exports),
        });
      }
    }

    // Files (leaf nodes — no children)
    for (const file of chunk.files ?? []) {
      children.push({ ...file });
    }

    return { ...folder, treeChildren: children };
  });
}

// ─── Lane output ─────────────────────────────────────────────────────────────

export interface LaneLayout {
  structureNodes: PositionedNode[];
  docsNodes: PositionedNode[];
  otherNodes: PositionedNode[];
  /** Y origin of docs lane */
  docsLaneY: number;
  /** Y origin of other lane */
  otherLaneY: number;
  /** Total canvas height */
  totalHeight: number;
}

// ─── Main layout function ─────────────────────────────────────────────────────

export function computeLayout(store: GraphStore, expanded: ReadonlySet<string>): LaneLayout {
  // ── Structure lane: d3.tree (left-to-right) ─────────────────────────────
  const structureNodes: PositionedNode[] = [];
  let structureHeight = LANE_HEADER_H + LANE_PADDING * 2 + NODE_SIZES.folder.h;

  const treeData = buildStructureTree(store, expanded);
  if (treeData) {
    const maxNodeH = Math.max(...Object.values(NODE_SIZES).map((s) => s.h));
    const colWidth = Math.max(...Object.values(NODE_SIZES).map((s) => s.w)) + H_GAP;

    const root = d3.hierarchy<TreeData>(treeData, (d) => d.treeChildren);

    const layout = d3.tree<TreeData>().nodeSize([maxNodeH + V_GAP, colWidth]);

    layout(root);

    // Normalize: d3.tree can return negative .x values (sibling spread axis)
    let minX = Infinity;
    root.each((n) => {
      if (n.x < minX) minX = n.x;
    });

    // Skip the TSKB root node (depth 0) and shift children left by one column
    root.each((n) => {
      if (n.depth === 0) return; // skip root
      structureNodes.push({
        ...n.data,
        // left-to-right: n.y = depth-based horizontal, n.x = vertical spread
        x: LANE_PADDING + n.y - colWidth,
        y: LANE_HEADER_H + LANE_PADDING + n.x - minX,
      });
    });

    const maxY = Math.max(...structureNodes.map((n) => n.y + NODE_SIZES[n.type].h));
    structureHeight = maxY + LANE_PADDING;
  }

  // ── Externals lane: below structure ──────────────────────────────────────
  const docsLaneY = structureHeight + LANE_GAP; // docs lane removed; reuse slot for externals
  const docsNodes: PositionedNode[] = [];

  const otherLaneY = docsLaneY;
  const otherNodes: PositionedNode[] = [];

  if (store.meta?.externals.length) {
    store.meta.externals.forEach((node, i) => {
      const { w } = NODE_SIZES.external;
      otherNodes.push({
        ...node,
        x: LANE_PADDING + i * (w + H_GAP),
        y: otherLaneY + LANE_HEADER_H + LANE_PADDING,
      });
    });
  }

  const otherLaneHeight = otherNodes.length
    ? LANE_HEADER_H + LANE_PADDING * 2 + NODE_SIZES.external.h
    : 0;

  return {
    structureNodes,
    docsNodes,
    otherNodes,
    docsLaneY,
    otherLaneY,
    totalHeight: otherLaneY + otherLaneHeight + LANE_GAP,
  };
}
