import * as d3 from "d3";
import type { PositionedNode, NodeType } from "../../types";
import { NODE_SIZES } from "../../layout/lane-engine";

// ─── Shared style maps ────────────────────────────────────────────────────────

export const NODE_COLORS: Record<NodeType, string> = {
  folder: "#3b82f6", // blue
  module: "#eab308", // yellow
  export: "#22c55e", // green
  doc: "#a855f7", // purple
  flow: "#06b6d4", // cyan
  term: "#f97316", // orange
  external: "#14b8a6", // teal
  file: "#64748b", // slate
};

export const NODE_ICON: Record<NodeType, string> = {
  folder: "▤",
  module: "◻",
  export: "⚡",
  doc: "☰",
  flow: "→",
  term: "◆",
  external: "⬡",
  file: "⊞",
};

// ─── NodeComponent interface ──────────────────────────────────────────────────

export interface NodeComponent {
  /** Append initial SVG elements into a newly entered <g.node> selection */
  enter(g: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown>): void;
  /** Update all attributes on an existing selection (positions, labels, state) */
  update(g: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown>): void;
  /** Bounding box for a node (used by layout + edge routing) */
  getSize(node: PositionedNode): { w: number; h: number };
  /** Connection point on the right side (edge source) */
  rightAnchor(node: PositionedNode): { x: number; y: number };
  /** Connection point on the left side (edge target) */
  leftAnchor(node: PositionedNode): { x: number; y: number };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export type ExpandHandler = (node: PositionedNode) => void;
export type SelectHandler = (node: PositionedNode) => void;
export type TraceLinkHandler = (node: PositionedNode) => void;
export type HasChildrenFn = (node: PositionedNode) => boolean;

// ─── BaseNodeRenderer ────────────────────────────────────────────────────────

/**
 * Renders any node as a rounded-rect card with:
 * - colored left accent bar
 * - type icon + label + description
 * - divider line
 * - edge count badge (○ N) — clickable to trace links
 * - expand button (▶) — shown only when hasChildren returns true
 *
 * Override enter()/update() in subclasses for custom shapes.
 */
export class BaseNodeRenderer implements NodeComponent {
  constructor(
    protected onExpand: ExpandHandler,
    protected onSelect: SelectHandler,
    protected onTraceLinks: TraceLinkHandler,
    protected hasChildren: HasChildrenFn
  ) {}

  getSize(node: PositionedNode): { w: number; h: number } {
    return NODE_SIZES[node.type] ?? NODE_SIZES.module;
  }

  rightAnchor(node: PositionedNode) {
    const { w, h } = this.getSize(node);
    return { x: node.x + w, y: node.y + h / 2 };
  }

  leftAnchor(node: PositionedNode) {
    const { h } = this.getSize(node);
    return { x: node.x, y: node.y + h / 2 };
  }

  enter(g: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown>): void {
    const self = this;

    // Card background
    g.append("rect")
      .attr("class", "node-bg")
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "#1a1f2e")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (_, d) => self.onSelect(d));

    // Left accent bar
    g.append("rect").attr("class", "node-accent").attr("x", 0).attr("rx", 3).attr("width", 4);

    // Type icon
    g.append("text")
      .attr("class", "node-icon")
      .attr("font-size", 12)
      .attr("dominant-baseline", "middle")
      .attr("fill", "#94a3b8");

    // Label
    g.append("text")
      .attr("class", "node-label")
      .attr("font-size", 11)
      .attr("font-weight", "700")
      .attr("fill", "#e2e8f0")
      .attr("dominant-baseline", "middle");

    // Description
    g.append("text")
      .attr("class", "node-desc")
      .attr("font-size", 9)
      .attr("fill", "#64748b")
      .attr("dominant-baseline", "middle");

    // Divider
    g.append("line")
      .attr("class", "node-divider")
      .attr("stroke", "#1e293b")
      .attr("stroke-width", 1);

    // Edge count badge
    g.append("text")
      .attr("class", "node-badge")
      .attr("font-size", 9)
      .attr("fill", "#475569")
      .attr("dominant-baseline", "middle")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        self.onTraceLinks(d);
      });

    // Expand button group
    const expandG = g
      .append("g")
      .attr("class", "node-expand-btn")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        self.onExpand(d);
      });

    expandG
      .append("rect")
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("fill", "#1e293b")
      .attr("width", 20)
      .attr("height", 14);

    expandG
      .append("text")
      .attr("font-size", 9)
      .attr("fill", "#3b82f6")
      .attr("dominant-baseline", "middle")
      .attr("text-anchor", "middle");

    this.update(g);
  }

  update(g: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown>): void {
    const self = this;

    g.each(function (d) {
      const el = d3.select<SVGGElement, PositionedNode>(this);
      const { w, h } = self.getSize(d);
      const color = NODE_COLORS[d.type];
      const canExpand = self.hasChildren(d);

      const ACCENT = 4;
      const ICON_X = ACCENT + 7;
      const TEXT_X = ICON_X + 15;
      const FOOTER_Y = h - 16;

      el.select(".node-bg").attr("width", w).attr("height", h).attr("stroke", color);

      el.select(".node-accent").attr("height", h).attr("fill", color);

      el.select(".node-icon")
        .attr("x", ICON_X)
        .attr("y", h * 0.3)
        .text(NODE_ICON[d.type]);

      el.select(".node-label")
        .attr("x", TEXT_X)
        .attr("y", h * 0.28)
        .text(trunc(d.label, 19));

      el.select(".node-desc")
        .attr("x", TEXT_X)
        .attr("y", h * 0.55)
        .text(trunc(d.description, 24));

      el.select(".node-divider")
        .attr("x1", ACCENT + 6)
        .attr("x2", w - 6)
        .attr("y1", FOOTER_Y - 5)
        .attr("y2", FOOTER_Y - 5);

      el.select(".node-badge")
        .attr("x", ACCENT + 7)
        .attr("y", FOOTER_Y + 4)
        .text(`○ ${d.edgeCount}`);

      // Expand button
      const expandG = el.select<SVGGElement>(".node-expand-btn");
      expandG.style("display", canExpand ? "block" : "none");
      if (canExpand) {
        const BTN_X = w - 26;
        const BTN_Y = FOOTER_Y - 5;
        expandG.attr("transform", `translate(${BTN_X},${BTN_Y})`);
        expandG.select("text").attr("x", 10).attr("y", 7).text("▶");
      }
    });

    // Move the whole group to its SVG position
    g.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
