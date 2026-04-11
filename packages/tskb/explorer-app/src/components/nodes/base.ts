import * as d3 from "d3";
import type { PositionedNode, NodeType } from "../../types";
import { NODE_SIZES } from "../../layout/lane-engine";
import { showNodeTooltip, moveNodeTooltip, hideNodeTooltip } from "../../ui/NodeTooltip";

// ─── Shared style maps ────────────────────────────────────────────────────────

export const NODE_COLORS: Record<NodeType, string> = {
  folder: "#2563eb", // blue
  module: "#ca8a04", // amber
  export: "#16a34a", // green
  doc: "#9333ea", // purple
  flow: "#0891b2", // cyan
  term: "#ea580c", // orange
  external: "#0d9488", // teal
  file: "#475569", // slate
};

export const NODE_ICON: Record<NodeType, string> = {
  folder: "▤",
  module: "▪",
  export: "▲",
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

export type CodePreviewHandler = (node: PositionedNode, clientX: number, clientY: number) => void;

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
    protected hasChildren: HasChildrenFn,
    protected onCodePreview?: CodePreviewHandler
  ) {}

  getSize(node: PositionedNode): { w: number; h: number } {
    return NODE_SIZES[node.type] ?? NODE_SIZES.module;
  }

  rightAnchor(node: PositionedNode) {
    const { w, h } = this.getSize(node);
    const offset = this.hasChildren(node) ? 9 : 0;
    return { x: node.x + w + offset, y: node.y + h / 2 };
  }

  leftAnchor(node: PositionedNode) {
    const { h } = this.getSize(node);
    return { x: node.x, y: node.y + h / 2 };
  }

  enter(g: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown>): void {
    // Node-level hover tooltip — use mouseover/mouseout (they bubble, unlike mouseenter/leave)
    // and guard with relatedTarget so we only fire at the group boundary.
    g.on("mouseover", function (event: MouseEvent, d: PositionedNode) {
      if (d.detail._ghost === "true") return;
      if (!(event.currentTarget as Element).contains(event.relatedTarget as Node)) {
        const { w, h } = NODE_SIZES[d.type] ?? NODE_SIZES.module;
        showNodeTooltip(d.label, d.path, d.description, NODE_COLORS[d.type], d.x + w, d.y + h / 2);
      }
    })
      .on("mouseout", function (event: MouseEvent) {
        if (!(event.currentTarget as Element).contains(event.relatedTarget as Node)) {
          hideNodeTooltip();
        }
      })
      .on("mousemove", (event: MouseEvent) => {
        moveNodeTooltip(event.clientX, event.clientY);
      });

    // Card background
    g.append("rect")
      .attr("class", "node-bg")
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "#ffffff")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (_, d) => {
        if (d.detail._ghost !== "true") this.onSelect(d);
      });

    // Left accent bar
    g.append("rect").attr("class", "node-accent").attr("x", 0).attr("rx", 3).attr("width", 4);

    // Type icon
    g.append("text")
      .attr("class", "node-icon")
      .attr("font-size", 12)
      .attr("dominant-baseline", "middle")
      .attr("fill", "#64748b");

    // Label
    g.append("text")
      .attr("class", "node-label")
      .attr("font-size", 11)
      .attr("font-weight", "700")
      .attr("fill", "#1e293b")
      .attr("dominant-baseline", "middle");

    // Description
    g.append("text")
      .attr("class", "node-desc")
      .attr("font-size", 9)
      .attr("fill", "#94a3b8")
      .attr("dominant-baseline", "middle");

    // Divider
    g.append("line")
      .attr("class", "node-divider")
      .attr("stroke", "#e2e8f0")
      .attr("stroke-width", 1);

    // Edge count badge
    g.append("text")
      .attr("class", "node-badge")
      .attr("font-size", 9)
      .attr("fill", "#94a3b8")
      .attr("dominant-baseline", "middle")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        this.onTraceLinks(d);
      });

    // Code preview bubble — top-center, half outside top edge
    const previewG = g
      .append("g")
      .attr("class", "node-preview-btn")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        if (this.onCodePreview) this.onCodePreview(d, event.clientX, event.clientY);
      })
      .on("mouseenter", function (_, d) {
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", c);
        d3.select(this).select("text").attr("fill", "#ffffff");
      })
      .on("mouseleave", function (_, d) {
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", "#ffffff");
        d3.select(this).select("text").attr("fill", c);
      });

    previewG.append("circle").attr("r", 9).attr("stroke-width", 1.5);
    previewG
      .append("text")
      .attr("font-size", 7)
      .attr("font-family", "monospace")
      .attr("font-weight", "600")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central");

    // Expand / children bubble — right edge, vertically centered, half outside
    const expandG = g
      .append("g")
      .attr("class", "node-expand-btn")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        this.onExpand(d);
      })
      .on("mouseenter", function (_, d) {
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", c);
        d3.select(this).select("text").attr("fill", "#ffffff");
      })
      .on("mouseleave", function (_, d) {
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", "#ffffff");
        d3.select(this).select("text").attr("fill", c);
      });

    expandG.append("circle").attr("r", 9).attr("stroke-width", 1.5).attr("fill", "#ffffff");
    expandG
      .append("text")
      .attr("font-size", 10)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central");

    this.update(g);
  }

  update(g: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown>): void {
    // d3's each() requires a regular function so `this` refers to the DOM element inside;
    // capture the class instance here to access component methods from within that callback
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const component = this;

    g.each(function (d) {
      const el = d3.select<SVGGElement, PositionedNode>(this);
      const { w, h } = component.getSize(d);
      const color = NODE_COLORS[d.type];
      const canExpand = component.hasChildren(d);

      const ACCENT = 4;
      const ICON_X = ACCENT + 7;
      const TEXT_X = ICON_X + 15;
      const FOOTER_Y = h - 16;

      const isGhost = d.detail._ghost === "true";

      el.select(".node-bg")
        .attr("width", w)
        .attr("height", h)
        .attr("stroke", isGhost ? "#cbd5e1" : color)
        .attr("stroke-dasharray", isGhost ? "5,3" : "none")
        .attr("fill", isGhost ? "transparent" : "#ffffff")
        .style("opacity", isGhost ? "0.55" : "1");

      // Ghost nodes: hide all content elements and anchors
      el.select(".node-accent").style("display", isGhost ? "none" : "");
      el.select(".node-icon").style("display", isGhost ? "none" : "");
      el.select(".node-divider").style("display", isGhost ? "none" : "");
      el.select(".node-badge").style("display", isGhost ? "none" : "");
      el.select(".node-preview-btn").style("display", "none");
      el.select(".node-expand-btn").style("display", "none");

      if (isGhost) {
        const maxChars = Math.floor((w - 12) / 5.5);
        el.select(".node-label")
          .style("display", null)
          .attr("x", 10)
          .attr("y", h / 2)
          .attr("fill", "#94a3b8")
          .attr("font-style", "italic")
          .text(trunc(d.path?.split("/").pop() || d.label, maxChars));
        el.select(".node-desc").text("").style("display", "none");
        return;
      }

      // Restore display for non-ghost nodes
      el.select(".node-label").style("display", null);
      el.select(".node-desc").style("display", null);

      el.select(".node-accent").attr("height", h).attr("fill", color);

      el.select(".node-icon")
        .attr("x", ICON_X)
        .attr("y", h * 0.3)
        .text(NODE_ICON[d.type]);

      const hasCode =
        d.type === "module" &&
        Array.isArray(d.detail.code) &&
        (d.detail.code as string[]).length > 0;
      const isPathType = d.type === "folder" || d.type === "file" || d.type === "module";
      const maxChars = Math.floor((w - TEXT_X - 6) / 5.5);
      let titleText: string;
      if (isPathType && d.path) {
        const segment = d.path.split("/").pop() ?? d.label;
        if (!d.parentId) {
          titleText = `/${d.path}`; // root: full path
        } else if (d.type === "folder") {
          titleText = `/${segment}`; // folders: /name
        } else {
          titleText = segment; // modules/files: name.ts (path includes extension)
        }
      } else {
        titleText = d.label;
      }

      el.select(".node-label")
        .attr("x", TEXT_X)
        .attr("y", h * 0.28)
        .text(trunc(titleText, maxChars));

      const descText = isPathType ? (d.description ? `Desc: ${d.description}` : "") : d.description;
      el.select(".node-desc")
        .attr("x", TEXT_X)
        .attr("y", h * 0.55)
        .text(trunc(descText, maxChars));

      el.select(".node-divider")
        .attr("x1", ACCENT + 6)
        .attr("x2", w - 6)
        .attr("y1", FOOTER_Y - 5)
        .attr("y2", FOOTER_Y - 5);

      el.select(".node-badge")
        .attr("x", ACCENT + 7)
        .attr("y", FOOTER_Y + 4)
        .text(`○ ${d.edgeCount}`);

      // Code preview bubble — top-center, half above the card
      const previewG = el.select<SVGGElement>(".node-preview-btn");
      previewG.style("display", hasCode ? "block" : "none");
      if (hasCode) {
        previewG.attr("transform", `translate(${w / 2},-4)`);
        previewG.select("circle").attr("stroke", color).attr("fill", "#ffffff");
        previewG.select("text").attr("fill", color).text("<>");
      }

      // Expand bubble — right edge, half outside, edges originate here
      const expandG = el.select<SVGGElement>(".node-expand-btn");
      expandG.style("display", canExpand ? "block" : "none");
      if (canExpand) {
        expandG.attr("transform", `translate(${w},${h / 2})`);
        expandG.select("circle").attr("stroke", color);
        expandG.select("text").attr("fill", color).text("+");
      }
    });

    // NOTE: group position (transform) is managed by main.ts to support animated transitions.
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
