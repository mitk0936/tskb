import * as d3 from "d3";
import type { PositionedNode } from "../types";
import { NODE_SIZES } from "../layout/lane-engine";

type Layer = d3.Selection<SVGGElement, unknown, null, undefined>;

// ─── Boundary resolution ──────────────────────────────────────────────────────

/**
 * For every visible node, walk up parentOf until a boundary-root node is found
 * (i.e. a node with detail.boundary set). Returns a map of nodeId → boundaryName.
 */
function resolveBoundaries(
  nodes: PositionedNode[],
  parentOf: Record<string, string>
): Map<string, string> {
  // Build boundary-root lookup: nodeId → boundaryName
  const roots = new Map<string, string>();
  for (const n of nodes) {
    const b = n.detail.boundary as string | undefined;
    if (b) roots.set(n.id, b);
  }

  const resolved = new Map<string, string>();
  const cache = new Map<string, string | null>();

  function walk(startId: string): string | null {
    // Iterative ancestor traversal — avoids call-stack overflow on deep trees.
    // Collect the chain of uncached ids, then backfill once we hit a terminal.
    // visited guards against cycles in parentOf (malformed graph data).
    const chain: string[] = [];
    const visited = new Set<string>();
    let id = startId;

    while (true) {
      if (visited.has(id)) {
        // Cycle detected — no boundary reachable from this chain
        for (const chainId of chain) cache.set(chainId, null);
        return null;
      }
      if (cache.has(id)) {
        const result = cache.get(id) as string | null;
        for (const chainId of chain) cache.set(chainId, result);
        return result;
      }
      if (roots.has(id)) {
        const result = roots.get(id)!;
        cache.set(id, result);
        for (const chainId of chain) cache.set(chainId, result);
        return result;
      }
      const parent = parentOf[id];
      if (!parent) {
        cache.set(id, null);
        for (const chainId of chain) cache.set(chainId, null);
        return null;
      }
      visited.add(id);
      chain.push(id);
      id = parent;
    }
  }

  for (const n of nodes) {
    const b = walk(n.id);
    if (b) resolved.set(n.id, b);
  }

  return resolved;
}

// ─── Hull computation ─────────────────────────────────────────────────────────

const PAD = 18; // px to inflate bounding boxes before hull

/** Emit 8 points per node (4 corners + 4 edge midpoints), inflated by PAD. */
function nodePoints(n: PositionedNode): [number, number][] {
  const { w, h } = NODE_SIZES[n.type] ?? NODE_SIZES.module;
  const x0 = n.x - PAD;
  const y0 = n.y - PAD;
  const x1 = n.x + w + PAD;
  const y1 = n.y + h + PAD;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [(x0 + x1) / 2, y0],
    [(x0 + x1) / 2, y1],
    [x0, (y0 + y1) / 2],
    [x1, (y0 + y1) / 2],
  ];
}

/** Simple integer hash of a string — used to seed perturbation. */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

/** Seeded pseudo-random in [-1, 1] based on a seed integer + index. */
function seededRand(seed: number, i: number): number {
  const x = Math.sin(seed + i) * 43758.5453123;
  return (x - Math.floor(x)) * 2 - 1;
}

const WOBBLE = 6; // max perturbation in px

/** Compute a smooth closed hull path for a set of nodes. */
function buildHullPath(nodes: PositionedNode[], seed: number): string | null {
  const points: [number, number][] = nodes.flatMap(nodePoints);
  const hull = d3.polygonHull(points);

  if (!hull || hull.length < 3) {
    // Single node fallback: circle
    const n = nodes[0];
    const { w, h } = NODE_SIZES[n.type] ?? NODE_SIZES.module;
    const cx = n.x + w / 2;
    const cy = n.y + h / 2;
    const r = Math.max(w, h) / 2 + PAD + 4;
    return `M ${cx - r},${cy} a ${r},${r} 0 1,0 ${r * 2},0 a ${r},${r} 0 1,0 ${-r * 2},0`;
  }

  const perturbed = hull.map(
    ([x, y], i) =>
      [x + seededRand(seed, i * 2) * WOBBLE, y + seededRand(seed, i * 2 + 1) * WOBBLE] as [
        number,
        number,
      ]
  );

  const line = d3
    .line<[number, number]>()
    .x((d) => d[0])
    .y((d) => d[1])
    .curve(d3.curveBasisClosed);

  return line(perturbed);
}

// ─── Group assembly ───────────────────────────────────────────────────────────

const STROKE = "#7c3aed";
const _STROKE_OPACITY = 0.3;
const FILL = "rgba(124,58,237,0.02)";

interface BoundaryGroup {
  name: string;
  nodes: PositionedNode[];
  path: string;
  labelX: number;
  labelY: number;
}

function buildGroups(nodes: PositionedNode[], parentOf: Record<string, string>): BoundaryGroup[] {
  console.log(
    `[boundary] buildGroups — ${nodes.length} nodes, ${Object.keys(parentOf).length} parentOf entries`
  );
  const resolved = resolveBoundaries(nodes, parentOf);
  console.log(`[boundary] resolveBoundaries done — ${resolved.size} resolved`);

  const byBoundary = new Map<string, PositionedNode[]>();
  for (const n of nodes) {
    const b = resolved.get(n.id);
    if (!b) continue;
    if (!byBoundary.has(b)) byBoundary.set(b, []);
    byBoundary.get(b)!.push(n);
  }

  const groups: BoundaryGroup[] = [];
  for (const [name, members] of byBoundary) {
    const seed = hashStr(name);
    const path = buildHullPath(members, seed);
    if (!path) continue;

    const topY = Math.min(...members.map((n) => n.y));
    const leftX = Math.min(...members.map((n) => n.x));
    const rightX = Math.max(...members.map((n) => n.x + (NODE_SIZES[n.type]?.w ?? 160)));
    const centerX = (leftX + rightX) / 2;

    groups.push({ name, nodes: members, path, labelX: centerX, labelY: topY - PAD + 4 });
  }

  return groups;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

const LABEL_FONT_SIZE = 14;

/**
 * Render one <g.boundary-group> per boundary into `layer`.
 * Labels use local coordinates and a counter-scale transform so they remain
 * visually constant size (and readable at any zoom level).
 * Called from ExplorerApp.render() after allNodes is assembled.
 */
export function renderBoundaryGroups(
  layer: Layer,
  nodes: PositionedNode[],
  parentOf: Record<string, string>,
  zoomK: number
): void {
  const groups = buildGroups(nodes, parentOf);

  const sel = layer
    .selectAll<SVGGElement, BoundaryGroup>("g.boundary-group")
    .data(groups, (d) => d.name);

  sel.exit().remove();

  const enter = sel
    .enter()
    .append("g")
    .attr("class", "boundary-group")
    .style("pointer-events", "none");

  enter.append("path").attr("class", "boundary-hull");
  enter.append("line").attr("class", "boundary-label-tick");
  const labelG = enter.append("g").attr("class", "boundary-label");
  labelG.append("rect").attr("rx", 3).attr("ry", 3);
  labelG.append("text");

  const merged = enter.merge(sel);

  merged
    .select<SVGPathElement>(".boundary-hull")
    .attr("d", (d) => d.path)
    .attr("fill", FILL)
    .attr("stroke", STROKE)
    .attr("stroke-opacity", 1)
    .attr("stroke-width", 1.5)
    .attr("stroke-dasharray", "8,5");

  // Initial label setup (text content + rect size in local coords)
  merged.select<SVGGElement>(".boundary-label").each(function (d) {
    const g = d3.select(this);
    const text = g.select<SVGTextElement>("text");
    const rect = g.select<SVGRectElement>("rect");

    text
      .attr("font-size", LABEL_FONT_SIZE)
      .attr("font-weight", "700")
      .attr("fill", STROKE)
      .attr("fill-opacity", 1)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("x", 0)
      .attr("y", 0)
      .text(d.name);

    const textEl = text.node();
    const textW = textEl ? textEl.getBBox().width : d.name.length * 8;
    const PX = 6;
    const bw = textW + PX * 2;
    const bh = LABEL_FONT_SIZE + 6;

    rect
      .attr("x", -bw / 2)
      .attr("y", -bh / 2)
      .attr("width", bw)
      .attr("height", bh)
      .attr("fill", "#ffffff")
      .attr("stroke", STROKE)
      .attr("stroke-opacity", 1)
      .attr("stroke-width", 0.8);
  });

  // Tick line: vertical connector from label bottom to hull top edge (in SVG coords)
  merged
    .select<SVGLineElement>(".boundary-label-tick")
    .attr("x1", (d) => d.labelX)
    .attr("x2", (d) => d.labelX)
    .attr("y1", (d) => d.labelY + (LABEL_FONT_SIZE + 6) / 2 / zoomK)
    .attr("y2", (d) => d.labelY + PAD - 4)
    .attr("stroke", STROKE)
    .attr("stroke-opacity", 0.5)
    .attr("stroke-width", 1);

  // Position labels with counter-scale so they stay the same visual size
  applyBoundaryLabelTransforms(layer, zoomK);
}

/**
 * Updates only the label transforms — called on every zoom tick so labels
 * remain visually constant in size as the canvas is zoomed.
 */
export function applyBoundaryLabelTransforms(layer: Layer, zoomK: number): void {
  layer
    .selectAll<SVGGElement, BoundaryGroup>(".boundary-label")
    .attr("transform", (d) => `translate(${d.labelX},${d.labelY}) scale(${1 / zoomK})`);

  // Tick line y1 depends on zoomK (label height in SVG space shrinks as you zoom out)
  layer
    .selectAll<SVGLineElement, BoundaryGroup>(".boundary-label-tick")
    .attr("y1", (d) => d.labelY + (LABEL_FONT_SIZE + 6) / 2 / zoomK);
}
