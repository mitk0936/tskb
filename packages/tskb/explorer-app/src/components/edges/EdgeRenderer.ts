import * as d3 from "d3";
import type { PositionedNode, ExplorerLink } from "../../types";
import { NODE_SIZES, type LaneLayout } from "../../layout/lane-engine";
import { NODE_COLORS } from "../nodes/base";

function nodeSize(node: PositionedNode): { w: number; h: number } {
  if (node.detail._ghost === "true" && node.type === "folder") return { w: 130, h: 38 };
  return NODE_SIZES[node.type];
}

export interface StructureLink {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  targetType: PositionedNode["type"];
  ghost?: boolean;
}

/**
 * Derives parent → child links from parentId references in the positioned node list.
 */
export function buildStructureLinks(nodes: PositionedNode[]): StructureLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: StructureLink[] = [];

  for (const node of nodes) {
    if (!node.parentId) continue;
    const parent = byId.get(node.parentId);
    if (!parent) continue;

    const parentSize = nodeSize(parent);
    const childSize = nodeSize(node);
    const isGhost = node.detail._ghost === "true";

    links.push({
      sourceX: parent.x + parentSize.w,
      sourceY: parent.y + parentSize.h / 2,
      targetX: node.x,
      targetY: node.y + childSize.h / 2,
      targetType: node.type,
      ghost: isGhost,
    });
  }

  return links;
}

/**
 * Renders structure-lane parent→child links as cubic bezier curves.
 */
export function renderStructureEdges(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  links: StructureLink[]
): void {
  const paths = container
    .selectAll<SVGPathElement, StructureLink>("path.struct-link")
    .data(links, (d) => `${d.sourceX},${d.sourceY}:${d.targetX},${d.targetY}`);

  paths
    .enter()
    .append("path")
    .attr("class", "struct-link")
    .attr("fill", "none")
    .attr("stroke-width", 1.5)
    .merge(paths)
    .attr("stroke", (d) => NODE_COLORS[d.targetType] + (d.ghost ? "59" : "66")) // ghost: 35%, normal: 40%
    .attr("stroke-dasharray", (d) => (d.ghost ? "4,3" : "none"))
    .attr("d", (d) => cubicH(d.sourceX, d.sourceY, d.targetX, d.targetY));

  paths.exit().remove();
}

/**
 * Renders lane header labels and background bands.
 */
export function renderLaneBands(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  layout: LaneLayout,
  canvasWidth: number
): void {
  const W = canvasWidth;
  const HEADER_H = 28;

  interface LaneBand {
    label: string;
    y: number;
    h: number;
    color: string;
  }

  const lanes: LaneBand[] = [{ label: "Structure", y: 0, h: layout.docsLaneY, color: "#f1f5f9" }];

  if (layout.docsNodes.length) {
    lanes.push({
      label: "Docs",
      y: layout.docsLaneY,
      h: layout.otherLaneY - layout.docsLaneY,
      color: "#f8fafc",
    });
  }

  if (layout.otherNodes.length) {
    lanes.push({
      label: "Terms / Flows",
      y: layout.otherLaneY,
      h: layout.totalHeight - layout.otherLaneY,
      color: "#f1f5f9",
    });
  }

  // Bands
  const rects = container.selectAll<SVGRectElement, LaneBand>("rect.lane-band").data(lanes);

  rects
    .enter()
    .append("rect")
    .attr("class", "lane-band")
    .merge(rects)
    .attr("x", 0)
    .attr("y", (d) => d.y)
    .attr("width", W)
    .attr("height", (d) => d.h)
    .attr("fill", (d) => d.color)
    .attr("stroke", "#e2e8f0")
    .attr("stroke-width", 1);

  rects.exit().remove();

  // Labels
  const labels = container.selectAll<SVGTextElement, LaneBand>("text.lane-label").data(lanes);

  labels
    .enter()
    .append("text")
    .attr("class", "lane-label")
    .attr("font-size", 10)
    .attr("font-weight", "600")
    .attr("fill", "#94a3b8")
    .attr("letter-spacing", "0.06em")
    .merge(labels)
    .attr("x", 14)
    .attr("y", (d) => d.y + HEADER_H / 2 + 4)
    .text((d) => d.label.toUpperCase());

  labels.exit().remove();
}

// ─── Relation edges ───────────────────────────────────────────────────────────

export interface RelationLink {
  source: PositionedNode;
  target: PositionedNode;
  label?: string;
  type: "related-to" | "imports";
}

/**
 * Pairs cross-edges with their positioned source and target nodes.
 * Only produces links where both ends are visible AND at least one endpoint
 * has its relations toggled open (outgoing for source, incoming for target).
 * When a node is not yet visible, the edge attaches to the nearest visible
 * ancestor found by walking up the parentOf map.
 */
export function buildRelationLinks(
  nodes: PositionedNode[],
  crossEdges: ExplorerLink[],
  relationsOutgoing: ReadonlySet<string>,
  relationsIncoming: ReadonlySet<string>,
  parentOf: ReadonlyMap<string, string>
): RelationLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function nearestVisible(id: string): PositionedNode | undefined {
    let current: string | undefined = id;
    while (current) {
      const node = byId.get(current);
      if (node) return node;
      current = parentOf.get(current);
    }
    return undefined;
  }

  const seen = new Set<string>();
  return crossEdges.flatMap((e) => {
    if (e.type !== "related-to" && e.type !== "imports") return [];
    if (!relationsIncoming.has(e.source) && !relationsOutgoing.has(e.target)) return [];
    const src = nearestVisible(e.source);
    const tgt = nearestVisible(e.target);
    if (!src || !tgt || src.id === tgt.id) return [];
    const key = `${src.id}→${tgt.id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ source: src, target: tgt, label: e.label, type: e.type }];
  });
}

// ─── Relation tooltip (HTML overlay) ─────────────────────────────────────────

let relTooltipEl: HTMLDivElement | null = null;

function ensureRelTooltip(): HTMLDivElement {
  if (!relTooltipEl) {
    relTooltipEl = document.createElement("div");
    relTooltipEl.id = "relation-tooltip";
    Object.assign(relTooltipEl.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "500",
      display: "none",
      opacity: "0",
      transition: "opacity 0.1s ease",
      background: "#312e81",
      color: "#e0e7ff",
      borderRadius: "8px",
      padding: "5px 10px",
      fontSize: "12px",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fontWeight: "600",
      whiteSpace: "nowrap",
      boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
    });
    document.body.appendChild(relTooltipEl);
  }
  return relTooltipEl;
}

function showRelTooltip(text: string, clientX: number, clientY: number): void {
  const el = ensureRelTooltip();
  el.textContent = text;
  el.style.display = "block";
  // Position above cursor
  requestAnimationFrame(() => {
    const w = el.offsetWidth;
    el.style.left = `${clientX - w / 2}px`;
    el.style.top = `${clientY - 36}px`;
    el.style.opacity = "1";
  });
}

function hideRelTooltip(): void {
  if (relTooltipEl) {
    relTooltipEl.style.opacity = "0";
    relTooltipEl.style.display = "none";
  }
}

function relationTooltipText(d: RelationLink): string {
  const prefix = d.type === "imports" ? "imports" : d.label;
  return prefix
    ? `${d.source.label} → ${prefix} → ${d.target.label}`
    : `${d.source.label} → ${d.target.label}`;
}

/**
 * Renders semantic relation edges as tapered filled shapes —
 * wide at source (outgoing bubble), tapering to a point at target (ingoing bubble).
 * On hover: highlight + floating label tooltip.
 */
export function renderRelationEdges(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  links: RelationLink[]
): void {
  const groups = container
    .selectAll<SVGGElement, RelationLink>("g.relation-link")
    .data(links, (d) => `${d.source.id}→${d.target.id}`);

  groups.exit().remove();

  const entered = groups.enter().append("g").attr("class", "relation-link");
  entered.append("path").attr("class", "relation-path");

  const merged = entered.merge(groups);

  merged.each(function (d) {
    const { sx, sy, tx, ty } = relAnchorPoints(d.source, d.target);
    d3.select(this)
      .select(".relation-path")
      .attr("stroke", "none")
      .attr("fill", NODE_COLORS[d.target.type])
      .attr("fill-opacity", 0.35)
      .attr("d", bandBubble(sx, sy, tx, ty));
  });

  merged
    .on("mouseenter", function (event: MouseEvent, d) {
      d3.select(this).select(".relation-path").attr("fill-opacity", 0.75);
      showRelTooltip(relationTooltipText(d), event.clientX, event.clientY);
    })
    .on("mousemove", function (event: MouseEvent, d) {
      showRelTooltip(relationTooltipText(d), event.clientX, event.clientY);
    })
    .on("mouseleave", function () {
      d3.select(this).select(".relation-path").attr("fill-opacity", 0.35);
      hideRelTooltip();
    });
}

/** Outgoing bubble (top-right) of source → ingoing bubble (bottom-center) of target. */
function relAnchorPoints(
  src: PositionedNode,
  tgt: PositionedNode
): { sx: number; sy: number; tx: number; ty: number } {
  const ss = nodeSize(src);
  const ts = nodeSize(tgt);
  return {
    sx: src.x + ss.w, // right edge — importer (source): bottom-right
    sy: src.y + ss.h,
    tx: tgt.x + ts.w, // right edge — imported (target): top-right
    ty: tgt.y,
  };
}

// ─── Path helper ─────────────────────────────────────────────────────────────

/** Horizontal cubic bezier: source on right, target on left */
function cubicH(sx: number, sy: number, tx: number, ty: number): string {
  const cx = (sx + tx) / 2;
  return `M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`;
}

/** Vertical cubic bezier: source on bottom, target on top */
function cubicV(sx: number, sy: number, tx: number, ty: number): string {
  const cy = (sy + ty) / 2;
  return `M${sx},${sy} C${sx},${cy} ${tx},${cy} ${tx},${ty}`;
}

/**
 * Rightward arc band for relation edges: wide at both ends, curves to the right.
 * Uses a quadratic bezier with the control point pushed rightward from the midpoint.
 */
function bandBubble(sx: number, sy: number, tx: number, ty: number): string {
  const hw = 8;
  const bulge = Math.max(60, Math.abs(ty - sy) * 0.4);
  const cpx = Math.max(sx, tx) + bulge; // always to the right of both endpoints
  const cpy = (sy + ty) / 2;

  // Source (top-right corner): spread horizontally — band exits left/right of the corner
  // Target (bottom-right corner): spread vertically — band arrives above/below the corner
  return [
    `M${sx - hw},${sy}`,
    `Q${cpx},${cpy} ${tx},${ty - hw}`,
    `L${tx},${ty + hw}`,
    `Q${cpx},${cpy} ${sx + hw},${sy}`,
    "Z",
  ].join(" ");
}
