import * as d3 from "d3";
import type { PositionedNode, NodeType } from "../../types";
import { isGhost } from "../../types";
import { NODE_SIZES, nodeSize } from "../../layout/lane-engine";
import { showNodeTooltip, hideNodeTooltip } from "../../ui/NodeTooltip";
import { showToast } from "../../ui/Toast";
import { EyeIcon, MinusIcon, replaceIcon } from "../../ui/icons";

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
export type ChipClickHandler = (node: PositionedNode, chip: "docs" | "flows") => void;
export type GetRefsFn = (nodeId: string) => string[];

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
    protected onChipClick?: ChipClickHandler,
    protected getReferencingDocs?: GetRefsFn,
    protected getReferencingFlows?: GetRefsFn
  ) {}

  getSize(node: PositionedNode): { w: number; h: number } {
    return nodeSize(node);
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
      if (!(event.currentTarget as Element).contains(event.relatedTarget as Node)) {
        const { h } = nodeSize(d); // nodeSize handles ghost nodes (h=28) correctly
        const displayName = d.path?.split("/").pop() ?? d.label;
        const metadata =
          d.type === "external" && d.detail && typeof d.detail === "object"
            ? (d.detail as Record<string, string>)
            : undefined;
        showNodeTooltip(
          displayName,
          d.path,
          d.description,
          NODE_COLORS[d.type],
          d.x,
          d.y + h / 2,
          metadata
        );
      }
    }).on("mouseout", function (event: MouseEvent) {
      if (!(event.currentTarget as Element).contains(event.relatedTarget as Node)) {
        hideNodeTooltip();
      }
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
        this.onSelect(d);
      });

    // Left accent bar
    g.append("rect").attr("class", "node-accent").attr("x", 0).attr("rx", 3).attr("width", 4);

    // Type icon
    g.append("text")
      .attr("class", "node-icon")
      .attr("font-size", 12)
      .attr("dominant-baseline", "middle")
      .attr("fill", "#64748b");

    // Label — click copies the node path/id to clipboard
    g.append("text")
      .attr("class", "node-label")
      .attr("font-size", 11)
      .attr("font-weight", "700")
      .attr("fill", "#1e293b")
      .attr("dominant-baseline", "middle")
      .style("cursor", "pointer")
      .on("click", function (event: MouseEvent, d: PositionedNode) {
        event.stopPropagation();
        const text = d.path ?? d.label;
        navigator.clipboard
          .writeText(text)
          .then(() => showToast(`⎘ ${text}`))
          .catch(() => {});
      });

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
    for (const chipType of ["docs", "flows"] as const) {
      const cls = `node-btn-${chipType}`;
      const chip = g
        .append("g")
        .attr("class", cls)
        .style("display", "none") // hidden until update() shows them
        .style("cursor", "pointer")
        .on("click", (event, d) => {
          event.stopPropagation();
          if (this.onChipClick) this.onChipClick(d, chipType);
        })
        .on("mouseenter", function () {
          d3.select(this).style("filter", "brightness(0.88)");
        })
        .on("mouseleave", function () {
          d3.select(this).style("filter", "none");
        });
      chip.append("rect").attr("rx", 3).attr("ry", 3).attr("height", 13);
      chip
        .append("text")
        .attr("font-size", 8)
        .attr("font-weight", "600")
        .attr("dominant-baseline", "middle")
        .attr("text-anchor", "middle");
    }

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
      const TEXT_X = ACCENT + 8;
      const FOOTER_Y = h - 14;

      const ghost = isGhost(d);

      el.select(".node-bg")
        .attr("width", w)
        .attr("height", h)
        .attr("stroke", ghost ? "#cbd5e1" : color)
        .attr("stroke-dasharray", ghost ? "5,3" : "none")
        .attr("fill", "#ffffff")
        .style("opacity", ghost ? "0.55" : "1");

      // Icon, divider, and desc are not rendered — always hidden
      el.select(".node-icon").style("display", "none");
      el.select(".node-divider").style("display", "none");

      // Ghost nodes: hide structural chrome; show only the filename label
      el.select(".node-accent").style("display", ghost ? "none" : "");
      el.select(".node-btn-docs").style("display", ghost ? "none" : "");
      el.select(".node-btn-flows").style("display", ghost ? "none" : "");
      el.select(".node-preview-btn").style("display", "none");

      if (ghost) {
        const maxChars = Math.floor((w - 12) / 5.5);
        el.select(".node-label")
          .style("display", null)
          .attr("x", 10)
          .attr("y", h / 2)
          .attr("fill", "#94a3b8")
          .attr("font-style", "italic")
          .text(trunc(d.path?.split("/").pop() || d.label, maxChars));
        el.select(".node-desc").style("display", "none");

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

      el.select(".node-label").style("display", null);
      el.select(".node-desc").style("display", "none");

      el.select(".node-accent").attr("height", h).attr("fill", color);

      const hasCode =
        (d.type === "module" || d.type === "export" || d.type === "file") &&
        Array.isArray(d.detail.code) &&
        (d.detail.code as string[]).length > 0;
      const isPathType = d.type === "folder" || d.type === "file" || d.type === "module";
      const maxChars = Math.floor((w - TEXT_X - 14) / 5.5);
      let titleText: string;
      if (isPathType && d.path) {
        const segment = d.path.split("/").pop() ?? d.label;
        if (!d.parentId) {
          titleText = `/${d.path}`; // root: full path
        } else if (d.type === "folder") {
          titleText = `/${segment}`; // folders: /name
        } else {
          titleText = segment; // modules/files: name.ts
        }
      } else if (d.type === "export") {
        titleText = exportDisplayLabel(d.label, d.detail.morphology as string | undefined);
      } else {
        titleText = d.label;
      }

      el.select(".node-label")
        .attr("x", TEXT_X)
        .attr("y", FOOTER_Y / 2)
        .text(trunc(titleText, maxChars));

      // Footer chip buttons — only on structure nodes that have referencing docs/flows
      const CHIP_Y = FOOTER_Y - 1;
      const isStructureNode = d.type !== "doc" && d.type !== "flow";
      const docsIds =
        isStructureNode && component.getReferencingDocs ? component.getReferencingDocs(d.id) : [];
      const flowsIds =
        isStructureNode && component.getReferencingFlows ? component.getReferencingFlows(d.id) : [];

      const CHIP_DOCS_BG = "#ede9fe";
      const CHIP_DOCS_TEXT = "#7c3aed";
      const CHIP_FLOWS_BG = "#cffafe";
      const CHIP_FLOWS_TEXT = "#0e7490";

      let chipX = ACCENT + 6;

      const docsChip = el.select<SVGGElement>(".node-btn-docs");
      if (docsIds.length > 0) {
        const label = `☰ Docs (${docsIds.length})`;
        const chipW = label.length * 4.6 + 8;
        docsChip.style("display", "block").attr("transform", `translate(${chipX},${CHIP_Y})`);
        docsChip
          .select("rect")
          .attr("width", chipW)
          .attr("fill", CHIP_DOCS_BG)
          .attr("stroke", "none");
        docsChip
          .select("text")
          .attr("x", chipW / 2)
          .attr("y", 6.5)
          .attr("fill", CHIP_DOCS_TEXT)
          .text(label);
        chipX += chipW + 4;
      } else {
        docsChip.style("display", "none");
      }

      const flowsChip = el.select<SVGGElement>(".node-btn-flows");
      if (flowsIds.length > 0) {
        const label = `→ Flows (${flowsIds.length})`;
        const chipW = label.length * 4.6 + 8;
        flowsChip.style("display", "block").attr("transform", `translate(${chipX},${CHIP_Y})`);
        flowsChip
          .select("rect")
          .attr("width", chipW)
          .attr("fill", CHIP_FLOWS_BG)
          .attr("stroke", "none");
        flowsChip
          .select("text")
          .attr("x", chipW / 2)
          .attr("y", 6.5)
          .attr("fill", CHIP_FLOWS_TEXT)
          .text(label);
      } else {
        flowsChip.style("display", "none");
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
    });

    // NOTE: group position (transform) is managed by main.ts to support animated transitions.
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function trunc(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/** Returns a display label for an export node with a kind suffix: fn(...) or Class {...}. */
export function exportDisplayLabel(label: string, morphologySummary?: string): string {
  if (!morphologySummary) return label;
  if (morphologySummary.includes("function")) return `${label}(...)`;
  if (morphologySummary.includes("class")) return `${label} {...}`;
  return label;
}
