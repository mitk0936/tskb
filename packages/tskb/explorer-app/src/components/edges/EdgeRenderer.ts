import * as d3 from "d3";
import type { PositionedNode } from "../../types";
import { NODE_SIZES, type LaneLayout } from "../../layout/lane-engine";
import { NODE_COLORS } from "../nodes/base";

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

    const parentSize = NODE_SIZES[parent.type];
    const childSize = NODE_SIZES[node.type];
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

// ─── Path helper ─────────────────────────────────────────────────────────────

/** Horizontal cubic bezier: source on right, target on left */
function cubicH(sx: number, sy: number, tx: number, ty: number): string {
  const cx = (sx + tx) / 2;
  return `M${sx},${sy} C${cx},${sy} ${cx},${ty} ${tx},${ty}`;
}
