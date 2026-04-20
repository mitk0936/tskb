import * as d3 from "d3";
import type { PositionedNode, NodeType } from "../../types";
import { NODE_SIZES } from "../../layout/lane-engine";
import { showNodeTooltip, moveNodeTooltip, hideNodeTooltip } from "../../ui/NodeTooltip";
import {
  EyeIcon,
  MinusIcon,
  ArrowUpLeftIcon,
  ArrowUpRightIcon,
  appendIcon,
  replaceIcon,
} from "../../ui/icons";

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
  /** Connection point for outgoing edges (top-right bubble) */
  outgoing(node: PositionedNode): { x: number; y: number };
  /** Connection point for incoming edges (bottom-right bubble) */
  ingoing(node: PositionedNode): { x: number; y: number };
}

// ─── Handlers ────────────────────────────────────────────────────────────────

export type ExpandHandler = (node: PositionedNode) => void;
export type SelectHandler = (node: PositionedNode) => void;
export type TraceLinkHandler = (node: PositionedNode) => void;
export type HasChildrenFn = (node: PositionedNode) => boolean;
export type IsExpandedFn = (node: PositionedNode) => boolean;

export type CodePreviewHandler = (node: PositionedNode, clientX: number, clientY: number) => void;

export interface RelationHandlers {
  hasIncoming: (node: PositionedNode) => boolean;
  hasOutgoing: (node: PositionedNode) => boolean;
  isIncomingOpen: (node: PositionedNode) => boolean;
  isOutgoingOpen: (node: PositionedNode) => boolean;
  onToggleIncoming: (node: PositionedNode) => void;
  onToggleOutgoing: (node: PositionedNode) => void;
}

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
    protected isExpanded: IsExpandedFn,
    protected onCodePreview?: CodePreviewHandler,
    protected relations?: RelationHandlers
  ) {}

  getSize(node: PositionedNode): { w: number; h: number } {
    if (node.detail._ghost === "true" && node.type === "folder") {
      return { w: 130, h: 38 };
    }
    return NODE_SIZES[node.type] ?? NODE_SIZES.module;
  }

  outgoing(node: PositionedNode) {
    const { w } = this.getSize(node);
    return { x: node.x + w, y: node.y };
  }

  ingoing(node: PositionedNode) {
    const { w, h } = this.getSize(node);
    return { x: node.x + w, y: node.y + h };
  }

  enter(g: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown>): void {
    // Node-level hover tooltip — use mouseover/mouseout (they bubble, unlike mouseenter/leave)
    // and guard with relatedTarget so we only fire at the group boundary.
    g.on("mouseover", function (event: MouseEvent, d: PositionedNode) {
      if (d.detail._ghost === "true") return;
      if (!(event.currentTarget as Element).contains(event.relatedTarget as Node)) {
        const { w, h } = NODE_SIZES[d.type] ?? NODE_SIZES.module;
        showNodeTooltip(d.label, d.path, d.description, NODE_COLORS[d.type], d.x, d.y + h / 2);
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

    // Footer chip buttons — Docs | Flows
    for (const cls of ["node-btn-docs", "node-btn-flows"]) {
      const chip = g
        .append("g")
        .attr("class", cls)
        .style("cursor", "pointer")
        .on("click", (event) => {
          event.stopPropagation();
        });
      chip.append("rect").attr("rx", 3).attr("ry", 3).attr("height", 13);
      chip
        .append("text")
        .attr("font-size", 8)
        .attr("font-weight", "600")
        .attr("dominant-baseline", "middle")
        .attr("text-anchor", "middle");
    }

    // Boundary badge — right-aligned in footer, only for folders with a boundary
    const boundaryG = g.append("g").attr("class", "node-boundary-badge");
    boundaryG.append("rect").attr("rx", 3).attr("ry", 3).attr("height", 13);
    boundaryG
      .append("text")
      .attr("font-size", 8)
      .attr("font-weight", "600")
      .attr("dominant-baseline", "middle")
      .attr("text-anchor", "middle");

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
        d3.select(this).select(".lucide-icon").attr("stroke", "#ffffff");
      })
      .on("mouseleave", function (_, d) {
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", "#ffffff");
        d3.select(this).select(".lucide-icon").attr("stroke", c);
      });

    expandG.append("circle").attr("r", 9).attr("stroke-width", 1.5).attr("fill", "#ffffff");
    // Icon placeholder — replaced on each update() with Eye or Minus
    expandG.append("g").attr("class", "lucide-icon");

    // Incoming relations bubble — bottom-right corner, half outside bottom edge
    const incomingG = g
      .append("g")
      .attr("class", "node-incoming-btn")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        this.relations?.onToggleIncoming(d);
      })
      .on("mouseenter", function (_, d) {
        if (d3.select(this).attr("data-active") === "true") return;
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", c);
        d3.select(this).select(".lucide-icon").attr("stroke", "#ffffff");
      })
      .on("mouseleave", function (_, d) {
        if (d3.select(this).attr("data-active") === "true") return;
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", "#ffffff");
        d3.select(this).select(".lucide-icon").attr("stroke", c);
      });
    incomingG.append("circle").attr("r", 9).attr("stroke-width", 1.5).attr("fill", "#ffffff");
    incomingG.append("g").attr("class", "lucide-icon");

    // Outgoing relations bubble — top-right corner, half outside top edge
    const outgoingG = g
      .append("g")
      .attr("class", "node-outgoing-btn")
      .style("cursor", "pointer")
      .on("click", (event, d) => {
        event.stopPropagation();
        this.relations?.onToggleOutgoing(d);
      })
      .on("mouseenter", function (_, d) {
        if (d3.select(this).attr("data-active") === "true") return;
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", c);
        d3.select(this).select(".lucide-icon").attr("stroke", "#ffffff");
      })
      .on("mouseleave", function (_, d) {
        if (d3.select(this).attr("data-active") === "true") return;
        const c = NODE_COLORS[d.type];
        d3.select(this).select("circle").attr("fill", "#ffffff");
        d3.select(this).select(".lucide-icon").attr("stroke", c);
      });
    outgoingG.append("circle").attr("r", 9).attr("stroke-width", 1.5).attr("fill", "#ffffff");
    outgoingG.append("g").attr("class", "lucide-icon");

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
      el.select(".node-btn-docs").style("display", isGhost ? "none" : "");
      el.select(".node-btn-flows").style("display", isGhost ? "none" : "");
      el.select(".node-preview-btn").style("display", "none");

      if (isGhost) {
        el.select(".node-incoming-btn").style("display", "none");
        el.select(".node-outgoing-btn").style("display", "none");
        el.select(".node-boundary-badge").style("display", "none");
        const maxChars = Math.floor((w - 12) / 5.5);
        el.select(".node-label")
          .style("display", null)
          .attr("x", 10)
          .attr("y", h / 2)
          .attr("fill", "#94a3b8")
          .attr("font-style", "italic")
          .text(trunc(d.path?.split("/").pop() || d.label, maxChars));
        el.select(".node-desc").text("").style("display", "none");

        // Ghost folder nodes support expand just like real folders
        const ghostExpandG = el.select<SVGGElement>(".node-expand-btn");
        ghostExpandG.style("display", canExpand ? "block" : "none");
        if (canExpand) {
          ghostExpandG.attr("transform", `translate(${w},${h / 2})`);
          ghostExpandG.select("circle").attr("stroke", color);
          const ghostIcon = component.isExpanded(d) ? MinusIcon : EyeIcon;
          replaceIcon(
            ghostExpandG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
            ghostIcon,
            10,
            color
          );
        }
        return;
      }

      // Restore display for non-ghost nodes
      el.select(".node-label").style("display", null);
      el.select(".node-desc").style("display", null);

      el.select(".node-accent").attr("height", h).attr("fill", color);

      el.select(".node-icon")
        .attr("x", ICON_X)
        .attr("y", h * 0.32)
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
        .attr("y", h * 0.3)
        .text(trunc(titleText, maxChars));

      const descText = isPathType ? (d.description ? `Desc: ${d.description}` : "") : d.description;
      el.select(".node-desc")
        .attr("x", TEXT_X)
        .attr("y", h * 0.57)
        .text(trunc(descText, maxChars));

      el.select(".node-divider")
        .attr("x1", ACCENT + 6)
        .attr("x2", w - 6)
        .attr("y1", FOOTER_Y - 5)
        .attr("y2", FOOTER_Y - 5);

      // Footer chip buttons
      const CHIP_Y = FOOTER_Y - 1;
      const CHIP_PAD_X = 6;
      const chipColor = "#e2e8f0";
      const chipTextColor = "#64748b";

      const docsChip = el.select<SVGGElement>(".node-btn-docs");
      docsChip.attr("transform", `translate(${ACCENT + 6},${CHIP_Y})`);
      docsChip.select("rect").attr("width", 28).attr("fill", chipColor).attr("stroke", "none");
      docsChip.select("text").attr("x", 14).attr("y", 6.5).attr("fill", chipTextColor).text("Docs");

      const flowsChip = el.select<SVGGElement>(".node-btn-flows");
      flowsChip.attr("transform", `translate(${ACCENT + 6 + 28 + 4},${CHIP_Y})`);
      flowsChip.select("rect").attr("width", 30).attr("fill", chipColor).attr("stroke", "none");
      flowsChip
        .select("text")
        .attr("x", 15)
        .attr("y", 6.5)
        .attr("fill", chipTextColor)
        .text("Flows");

      // Boundary badge — right-aligned in footer, only for folders with a declared boundary
      const boundary = d.type === "folder" ? (d.detail.boundary as string | undefined) : undefined;
      const boundaryG = el.select<SVGGElement>(".node-boundary-badge");
      boundaryG.style("display", boundary ? "block" : "none");
      if (boundary) {
        const PAD = 5;
        const charW = 4.8;
        const badgeW = Math.ceil(boundary.length * charW) + PAD * 2;
        boundaryG.attr("transform", `translate(${w - 6 - badgeW},${CHIP_Y})`);
        boundaryG
          .select("rect")
          .attr("width", badgeW)
          .attr("fill", "#ede9fe")
          .attr("stroke", "#7c3aed")
          .attr("stroke-width", 0.8);
        boundaryG
          .select("text")
          .attr("x", badgeW / 2)
          .attr("y", 6.5)
          .attr("fill", "#7c3aed")
          .text(boundary);
      }

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
        const expandIcon = component.isExpanded(d) ? MinusIcon : EyeIcon;
        replaceIcon(
          expandG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
          expandIcon,
          10,
          color
        );
      }

      // Incoming relations bubble — bottom-right corner, half outside bottom edge
      const rel = component.relations;
      const incomingG = el.select<SVGGElement>(".node-incoming-btn");
      const showIncoming = !isGhost && !!rel && rel.hasIncoming(d);
      incomingG.style("display", showIncoming ? "block" : "none");
      if (showIncoming && rel) {
        const inOpen = rel.isIncomingOpen(d);
        incomingG
          .attr("transform", `translate(${w},${h})`)
          .attr("data-active", inOpen ? "true" : "false");
        incomingG
          .select("circle")
          .attr("stroke", color)
          .attr("fill", inOpen ? color : "#ffffff");
        replaceIcon(
          incomingG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
          ArrowUpLeftIcon,
          10,
          inOpen ? "#ffffff" : color
        );
      }

      // Outgoing relations bubble — top-right corner, half outside top edge
      const outgoingG = el.select<SVGGElement>(".node-outgoing-btn");
      const showOutgoing = !isGhost && !!rel && rel.hasOutgoing(d);
      outgoingG.style("display", showOutgoing ? "block" : "none");
      if (showOutgoing && rel) {
        const outOpen = rel.isOutgoingOpen(d);
        outgoingG
          .attr("transform", `translate(${w},0)`)
          .attr("data-active", outOpen ? "true" : "false");
        outgoingG
          .select("circle")
          .attr("stroke", color)
          .attr("fill", outOpen ? color : "#ffffff");
        replaceIcon(
          outgoingG as unknown as d3.Selection<SVGGElement, unknown, null, undefined>,
          ArrowUpRightIcon,
          10,
          outOpen ? "#ffffff" : color
        );
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
