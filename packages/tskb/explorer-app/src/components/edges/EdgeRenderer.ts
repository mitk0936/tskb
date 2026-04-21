import * as d3 from "d3";
import type { PositionedNode, ExplorerLink } from "../../types";
import { isGhost } from "../../types";
import { NODE_SIZES, nodeSize, type LaneLayout } from "../../layout/lane-engine";
import { NODE_COLORS } from "../nodes/base";

export interface StructureLink {
  sourceId: string;
  targetId: string;
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
    const ghost = isGhost(node);

    links.push({
      sourceId: parent.id,
      targetId: node.id,
      sourceX: parent.x + parentSize.w,
      sourceY: parent.y + parentSize.h / 2,
      targetX: node.x,
      targetY: node.y + childSize.h / 2,
      targetType: node.type,
      ghost,
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
    .data(links, (d) => `${d.sourceId}→${d.targetId}`);

  paths.exit().remove();

  const merged = paths
    .enter()
    .append("path")
    .attr("class", "struct-link")
    .attr("fill", "none")
    .attr("stroke-width", 1.5)
    .merge(paths);

  merged
    .attr("stroke", (d) => NODE_COLORS[d.targetType] + (d.ghost ? "59" : "66"))
    .attr("stroke-dasharray", (d) => (d.ghost ? "4,3" : "none"))
    .transition("layout")
    .duration(220)
    .ease(d3.easeCubicOut)
    .attrTween("d", function (d) {
      const el = d3.select(this);
      // Fall back to target coords on first render (no stored position yet)
      const sx0 = +(el.attr("data-sx") ?? d.sourceX);
      const sy0 = +(el.attr("data-sy") ?? d.sourceY);
      const tx0 = +(el.attr("data-tx") ?? d.targetX);
      const ty0 = +(el.attr("data-ty") ?? d.targetY);
      el.attr("data-sx", d.sourceX)
        .attr("data-sy", d.sourceY)
        .attr("data-tx", d.targetX)
        .attr("data-ty", d.targetY);
      const iSx = d3.interpolateNumber(sx0, d.sourceX);
      const iSy = d3.interpolateNumber(sy0, d.sourceY);
      const iTx = d3.interpolateNumber(tx0, d.targetX);
      const iTy = d3.interpolateNumber(ty0, d.targetY);
      return (t) => cubicH(iSx(t), iSy(t), iTx(t), iTy(t));
    });
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
      label: "Externals",
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
  type: "related-to" | "imports" | "imports-type";
}

/**
 * Pairs cross-edges with their positioned source and target nodes.
 * Both endpoints must be directly visible (present in the nodes list).
 * No ancestor fallback — edges appear only once both sides are rendered.
 */
export function buildRelationLinks(
  nodes: PositionedNode[],
  crossEdges: ExplorerLink[]
): RelationLink[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const seen = new Set<string>();
  return crossEdges.flatMap((e) => {
    if (e.type !== "related-to" && e.type !== "imports" && e.type !== "imports-type") return [];
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
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

function relImportPath(fromPath: string | undefined, toPath: string | undefined): string | null {
  if (!fromPath || !toPath) return null;
  const fromDir = fromPath.split("/").slice(0, -1);
  const toParts = toPath.split("/");
  let common = 0;
  while (
    common < fromDir.length &&
    common < toParts.length &&
    fromDir[common] === toParts[common]
  ) {
    common++;
  }
  const up = fromDir.length - common;
  const down = toParts.slice(common);
  const rel = [...Array(up).fill(".."), ...down].join("/");
  return up === 0 ? `./${rel}` : rel;
}

function fileName(node: PositionedNode): string {
  return node.path?.split("/").pop() ?? node.label;
}

function relationTooltipText(d: RelationLink): string {
  if (d.type === "imports" || d.type === "imports-type") {
    const typeLabel = d.type === "imports-type" ? "imports type from" : "imports from";
    const path = relImportPath(d.source.path, d.target.path) ?? d.target.path ?? d.target.label;
    return `${fileName(d.source)} ${typeLabel} ${path}`;
  }
  const prefix = d.label;
  return prefix
    ? `${fileName(d.source)} → ${prefix} → ${fileName(d.target)}`
    : `${fileName(d.source)} → ${fileName(d.target)}`;
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
    const { sx, sy, tx, ty, fromColor } = relAnchorPoints(d.source, d.target, d.type);
    const isTypeOnly = d.type === "imports-type";
    d3.select(this)
      .select(".relation-path")
      .attr("stroke", isTypeOnly ? fromColor : "none")
      .attr("stroke-width", isTypeOnly ? 1 : 0)
      .attr("stroke-dasharray", isTypeOnly ? "4,3" : "none")
      .attr("fill", fromColor)
      .attr("fill-opacity", isTypeOnly ? 0.08 : 0.2)
      .attr("d", bandBubble(sx, sy, tx, ty));
  });

  merged
    .on("mouseenter", function (event: MouseEvent, d) {
      const isTypeOnly = d.type === "imports-type";
      d3.select(this)
        .select(".relation-path")
        .attr("fill-opacity", isTypeOnly ? 0.35 : 0.65);
      showRelTooltip(relationTooltipText(d), event.clientX, event.clientY);
    })
    .on("mousemove", function (event: MouseEvent, d) {
      showRelTooltip(relationTooltipText(d), event.clientX, event.clientY);
    })
    .on("mouseleave", function (_event: MouseEvent, d) {
      d3.select(this)
        .select(".relation-path")
        .attr("fill-opacity", d.type === "imports-type" ? 0.08 : 0.2);
      hideRelTooltip();
    });
}

/**
 * Renders relation edge endpoint indicators (circle + arrow) in a separate layer
 * so they appear above node cards.
 */
export function renderRelationEndpoints(
  container: d3.Selection<SVGGElement, unknown, null, undefined>,
  links: RelationLink[]
): void {
  const groups = container
    .selectAll<SVGGElement, RelationLink>("g.relation-endpoint")
    .data(links, (d) => `${d.source.id}→${d.target.id}`);

  groups.exit().remove();

  const entered = groups
    .enter()
    .append("g")
    .attr("class", "relation-endpoint")
    .style("pointer-events", "none");

  // Source endpoint ("from"): top-right of source, arrow ↗
  const srcEnd = entered.append("g").attr("class", "relation-end-src");
  srcEnd.append("circle").attr("r", 9).attr("fill", "#ffffff").attr("stroke", "none");
  srcEnd
    .append("path")
    .attr("class", "arrow-icon")
    .attr("fill", "none")
    .attr("stroke-width", 1)
    .attr("stroke-linecap", "round");

  // Target endpoint ("to"): bottom-right of target, arrow ↖
  const tgtEnd = entered.append("g").attr("class", "relation-end-tgt");
  tgtEnd.append("circle").attr("r", 9).attr("fill", "#ffffff").attr("stroke", "none");
  tgtEnd
    .append("path")
    .attr("class", "arrow-icon")
    .attr("fill", "none")
    .attr("stroke-width", 1)
    .attr("stroke-linecap", "round");

  const merged = entered.merge(groups);

  merged.each(function (d) {
    const { sx, sy, tx, ty, fromColor, toColor } = relAnchorPoints(d.source, d.target, d.type);
    const g = d3.select(this);

    g.select(".relation-end-src").attr("transform", `translate(${sx},${sy})`);
    g.select<SVGPathElement>(".relation-end-src .arrow-icon")
      .attr("stroke", fromColor)
      .attr("d", "M -3,3 L 3,-3 M 0.5,-3 L 3,-3 L 3,-0.5"); // ↗

    g.select(".relation-end-tgt").attr("transform", `translate(${tx},${ty})`);
    g.select<SVGPathElement>(".relation-end-tgt .arrow-icon")
      .attr("stroke", toColor)
      .attr("d", "M 3,3 L -3,-3 M -0.5,-3 L -3,-3 L -3,-0.5"); // ↖
  });
}

/**
 * Returns anchor points and endpoint colors for a relation edge.
 * - related-to: natural direction — "from" on source, "to" on target.
 * - imports: source=importer, target=imported. Edge flows FROM imported TO importer,
 *   so anchors are swapped: "from" on target (imported), "to" on source (importer).
 */
function relAnchorPoints(
  src: PositionedNode,
  tgt: PositionedNode,
  type: RelationLink["type"]
): { sx: number; sy: number; tx: number; ty: number; fromColor: string; toColor: string } {
  const ss = nodeSize(src);
  const ts = nodeSize(tgt);
  if (type === "imports" || type === "imports-type") {
    return {
      sx: tgt.x + ts.w,
      sy: tgt.y, // "from" — top-right of imported (target)
      tx: src.x + ss.w,
      ty: src.y + ss.h, // "to"   — bottom-right of importer (source)
      fromColor: NODE_COLORS[tgt.type],
      toColor: NODE_COLORS[src.type],
    };
  }
  return {
    sx: src.x + ss.w,
    sy: src.y, // "from" — top-right of source
    tx: tgt.x + ts.w,
    ty: tgt.y + ts.h, // "to"   — bottom-right of target
    fromColor: NODE_COLORS[src.type],
    toColor: NODE_COLORS[tgt.type],
  };
}

// ─── Path helper ─────────────────────────────────────────────────────────────

/** Horizontal cubic bezier: source on right, target on left */
function cubicH(sx: number, sy: number, tx: number, ty: number): string {
  const cx = (sx + tx) / 2;
  return `M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`;
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
