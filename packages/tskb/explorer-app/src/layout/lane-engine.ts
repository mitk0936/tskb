import * as d3 from "d3";
import type { ExplorerNode, PositionedNode, NodeType } from "../types";
import type { GraphStore } from "../store/graph-store";

// ─── Constants ───────────────────────────────────────────────────────────────

export const NODE_SIZES: Record<NodeType, { w: number; h: number }> = {
  folder: { w: 190, h: 76 },
  module: { w: 165, h: 68 },
  export: { w: 145, h: 56 },
  doc: { w: 165, h: 68 },
  flow: { w: 165, h: 68 },
  term: { w: 145, h: 56 },
  external: { w: 145, h: 56 },
  file: { w: 130, h: 52 },
};

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

function buildFolderChildren(
  folders: ExplorerNode[],
  store: GraphStore,
  expanded: ReadonlySet<string>
): TreeData[] {
  return folders.map((folder) => {
    if (!expanded.has(folder.id)) return { ...folder };
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
        children.push({ ...mod });
      } else {
        children.push({
          ...mod,
          treeChildren: chunk.exports.filter((e) => e.parentId === mod.id).map((e) => ({ ...e })),
        });
      }
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

    root.each((n) => {
      structureNodes.push({
        ...n.data,
        // left-to-right: n.y = depth-based horizontal, n.x = vertical spread
        x: LANE_PADDING + n.y,
        y: LANE_HEADER_H + LANE_PADDING + n.x - minX,
      });
    });

    const maxY = Math.max(...structureNodes.map((n) => n.y + NODE_SIZES[n.type].h));
    structureHeight = maxY + LANE_PADDING;
  }

  // ── Docs lane: ordered by priority, horizontal list ──────────────────────
  const docsLaneY = structureHeight + LANE_GAP;
  const docsNodes: PositionedNode[] = [];

  if (store.meta?.docs.length) {
    const priorityOrder: Record<string, number> = {
      essential: 0,
      constraint: 1,
      supplementary: 2,
    };
    const sorted = [...store.meta.docs].sort(
      (a, b) =>
        (priorityOrder[a.priority ?? "supplementary"] ?? 2) -
        (priorityOrder[b.priority ?? "supplementary"] ?? 2)
    );

    sorted.forEach((doc, i) => {
      const { w } = NODE_SIZES.doc;
      docsNodes.push({
        ...doc,
        x: LANE_PADDING + i * (w + H_GAP),
        y: docsLaneY + LANE_HEADER_H + LANE_PADDING,
      });
    });
  }

  const docsLaneHeight = docsNodes.length ? LANE_HEADER_H + LANE_PADDING * 2 + NODE_SIZES.doc.h : 0;

  // ── Other lane: flows + terms + externals, horizontal list ───────────────
  const otherLaneY = docsLaneY + docsLaneHeight + (docsLaneHeight > 0 ? LANE_GAP : 0);
  const otherNodes: PositionedNode[] = [];

  if (store.meta) {
    const all = [...store.meta.flows, ...store.meta.terms, ...store.meta.externals];
    all.forEach((node, i) => {
      const { w } = NODE_SIZES[node.type] ?? NODE_SIZES.term;
      otherNodes.push({
        ...node,
        x: LANE_PADDING + i * (w + H_GAP),
        y: otherLaneY + LANE_HEADER_H + LANE_PADDING,
      });
    });
  }

  const otherLaneHeight = otherNodes.length
    ? LANE_HEADER_H + LANE_PADDING * 2 + NODE_SIZES.term.h
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
