import "./doc-panel.css";
import type { PositionedNode, ExplorerNode } from "../types";
import { showDomTooltip, hideDomTooltip } from "./DomTooltip";
import { NODE_COLORS, exportDisplayLabel } from "../components/nodes/base";
import { createHeaderButton } from "./HeaderActions";

export type OnNodeRefClick = (nodeId: string) => void;
export type GetNodeFn = (nodeId: string) => ExplorerNode | undefined;
export type OnNodeHighlightFn = (nodeId: string | null) => void;
export type OnNodePrefetchFn = (nodeId: string) => Promise<void>;

const PRIORITY_RANK: Record<string, number> = {
  essential: 0,
  constraint: 1,
  supplementary: 2,
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Side panel that renders the HTML content of doc nodes (and node details for
 * non-doc nodes). Slides in from the right when a node is selected.
 */
export class DocPanel {
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private onNodeRef: OnNodeRefClick | null = null;
  private getNode: GetNodeFn | null = null;
  private onNodeHighlight: OnNodeHighlightFn | null = null;
  private onNodePrefetch: OnNodePrefetchFn | null = null;

  constructor() {
    this.panel = document.getElementById("doc-panel")!;
    this.title = document.getElementById("doc-panel-title")!;
    this.body = document.getElementById("doc-panel-body")!;

    const actions = document.getElementById("doc-panel-actions")!;
    actions.appendChild(
      createHeaderButton("close", { title: "Close", onClick: () => this.hide() })
    );

    // Delegate clicks on node-ref links inside the panel body
    this.body.addEventListener("click", (e) => {
      const anchor = (e.target as Element).closest("a.tskb-ref");
      if (anchor) {
        e.preventDefault();
        const nodeId = anchor.getAttribute("data-node-id");
        if (nodeId && this.onNodeRef) this.onNodeRef(nodeId);
      }
    });
  }

  setOnNodeRef(cb: OnNodeRefClick): void {
    this.onNodeRef = cb;
  }
  setGetNode(fn: GetNodeFn): void {
    this.getNode = fn;
  }
  setOnNodeHighlight(fn: OnNodeHighlightFn): void {
    this.onNodeHighlight = fn;
  }
  setOnNodePrefetch(fn: OnNodePrefetchFn): void {
    this.onNodePrefetch = fn;
  }

  show(node: PositionedNode): void {
    const path = node.path ?? node.label;
    this.title.textContent = path;
    this.title.removeAttribute("data-refs");

    const html = node.detail.html as string | undefined;
    if (html) {
      this.body.innerHTML = html;
    } else {
      this.body.innerHTML = this.renderDetail(node);
    }

    this.wireRefLinks();
    this.panel.classList.add("open");
  }

  hide(): void {
    this.panel.classList.remove("open");
  }

  get isOpen(): boolean {
    return this.panel.classList.contains("open");
  }

  /** Show an accordion list of docs/flows that reference a given node. */
  showRefs(node: PositionedNode, kind: "docs" | "flows", items: ExplorerNode[]): void {
    const target = node.path ?? node.label;
    const kindLabel = kind === "docs" ? "Docs" : "Flows";
    const targetLink =
      `<a class="tskb-ref title-refs-target-link" data-node-id="${escapeHtml(node.id)}"` +
      ` data-node-display="${escapeHtml(target)}"` +
      ` data-no-rewrite title="Open ${escapeHtml(target)} in graph">${escapeHtml(target)}</a>`;
    this.title.innerHTML =
      `<span class="title-kind-chip title-kind-${kind}">${kindLabel}</span>` +
      `<span class="title-refs-target">related to ${targetLink}</span>`;
    this.title.dataset.refs = "true";
    this.body.innerHTML = this.renderAccordion(items, kind);
    this.wireRefLinks();
    // The header lives outside #doc-panel-body, so wire the title-bar ref too.
    this.wireTitleRef();
    this.panel.classList.add("open");
  }

  /**
   * Post-processes every `a.tskb-ref` in the panel body:
   * - Replaces text with the node's path or label
   * - Wires hover → NodeTooltip + graph highlight
   * - Wires mouseleave → hide tooltip + clear highlight
   * Click navigation is handled by the delegated listener in the constructor.
   */
  private wireRefLinks(): void {
    this.body.querySelectorAll<HTMLAnchorElement>("a.tskb-ref").forEach((a) => {
      const nodeId = a.getAttribute("data-node-id");
      if (!nodeId) return;

      // Some refs (accordion summary headers) opt out of text rewriting so the
      // priority badge + label stay intact. Hover behavior still applies.
      const skipTextRewrite = a.hasAttribute("data-no-rewrite");

      const node = this.getNode?.(nodeId);
      if (!skipTextRewrite) {
        if (node) {
          let display: string;
          if (node.type === "export") {
            display = exportDisplayLabel(node.label, node.detail.morphology as string | undefined);
          } else if (node.type === "folder") {
            display = (node.path ?? node.label) + "/"; // path with trailing slash
          } else {
            display = node.path ?? node.label; // full path for modules/files
          }
          a.textContent = display;
        } else {
          // Node not loaded yet — use pre-computed display text embedded at build time
          a.textContent = a.getAttribute("data-node-display") ?? nodeId;
        }
      }
      a.title = node?.path ?? nodeId;

      let hovering = false;

      a.addEventListener("mouseenter", () => {
        hovering = true;
        const liveNode = this.getNode?.(nodeId) ?? node;
        this.showRefTooltip(liveNode, a, nodeId);
        this.onNodeHighlight?.(nodeId);

        if (!liveNode && this.onNodePrefetch) {
          this.onNodePrefetch(nodeId)
            .then(() => {
              if (!hovering) return;
              const freshNode = this.getNode?.(nodeId);
              if (freshNode) this.showRefTooltip(freshNode, a, nodeId);
            })
            .catch(() => {
              /* ignore prefetch errors */
            });
        }
      });

      a.addEventListener("mouseleave", () => {
        hovering = false;
        hideDomTooltip();
        this.onNodeHighlight?.(null);
      });
    });
  }

  /**
   * Wires the title-bar's `a.tskb-ref` (the "related to" link). Lives outside
   * #doc-panel-body so the body click delegate doesn't see it.
   */
  private wireTitleRef(): void {
    const a = this.title.querySelector<HTMLAnchorElement>("a.tskb-ref");
    if (!a) return;
    const nodeId = a.getAttribute("data-node-id");
    if (!nodeId) return;

    a.addEventListener("click", (e) => {
      e.preventDefault();
      this.onNodeRef?.(nodeId);
    });

    let hovering = false;
    a.addEventListener("mouseenter", () => {
      hovering = true;
      const liveNode = this.getNode?.(nodeId);
      this.showRefTooltip(liveNode, a, nodeId);
      this.onNodeHighlight?.(nodeId);
      if (!liveNode && this.onNodePrefetch) {
        this.onNodePrefetch(nodeId)
          .then(() => {
            if (!hovering) return;
            const fresh = this.getNode?.(nodeId);
            if (fresh) this.showRefTooltip(fresh, a, nodeId);
          })
          .catch(() => {
            /* ignore */
          });
      }
    });
    a.addEventListener("mouseleave", () => {
      hovering = false;
      hideDomTooltip();
      this.onNodeHighlight?.(null);
    });
  }

  private renderAccordion(items: ExplorerNode[], kind: "docs" | "flows"): string {
    if (items.length === 0) return `<p class="panel-empty">No ${kind} reference this node.</p>`;

    const sorted = items.slice().sort((a, b) => {
      const ra = a.priority ? (PRIORITY_RANK[a.priority] ?? 3) : 3;
      const rb = b.priority ? (PRIORITY_RANK[b.priority] ?? 3) : 3;
      return ra - rb;
    });

    return sorted
      .map((item, idx) => {
        const badge = item.priority
          ? `<span class="priority-badge priority-${item.priority}">${item.priority}</span>`
          : "";

        const pathText = item.path ?? item.label ?? item.id;
        const headline = item.description?.trim() || pathText;

        // Summary headline: the description (what it explains). Falls back to
        // the path if no description.
        const summaryHeadline = `<span class="accordion-headline">${escapeHtml(headline)}</span>`;

        // Body lead: small monospace ref link to the actual doc/flow node.
        // Clicking navigates to it in the graph.
        const pathLink =
          `<a class="tskb-ref accordion-path-ref" data-node-id="${escapeHtml(item.id)}"` +
          ` data-node-display="${escapeHtml(pathText)}"` +
          ` data-no-rewrite title="Open ${escapeHtml(pathText)} in graph">${escapeHtml(pathText)}</a>`;
        const pathRow = `<div class="accordion-path">${pathLink}</div>`;

        let body: string;
        if (kind === "flows") {
          body = `<div class="accordion-body">${pathRow}${this.renderFlowSteps(item)}</div>`;
        } else {
          const html = item.detail.html as string | undefined;
          body = html
            ? `<div class="accordion-body">${pathRow}${html}</div>`
            : `<div class="accordion-body">${pathRow}</div>`;
        }

        const openAttr = idx === 0 ? " open" : "";

        return `<details class="accordion-item"${openAttr}>
  <summary class="accordion-summary">${summaryHeadline}${badge}</summary>
  ${body}
</details>`;
      })
      .join("");
  }

  private renderFlowSteps(item: ExplorerNode): string {
    const raw = item.detail.stepsJson as string | undefined;
    if (!raw) return "";
    let steps: Array<{ nodeId: string; label?: string }>;
    try {
      steps = JSON.parse(raw) as Array<{ nodeId: string; label?: string }>;
    } catch {
      return "";
    }
    if (steps.length === 0) return "";
    const items = steps
      .map((s, i) => {
        const stepNode = this.getNode?.(s.nodeId);
        const typeAttr = stepNode ? ` data-node-type="${escapeHtml(stepNode.type)}"` : "";
        const display = stepNode ? (stepNode.path ?? s.nodeId) : s.nodeId;
        const displayAttr = ` data-node-display="${escapeHtml(display)}"`;
        const labelHtml = s.label
          ? `<span class="flow-step-label">${escapeHtml(s.label)}</span>`
          : "";
        return `<li class="flow-step">
  <span class="flow-step-num">${i + 1}</span>
  <div class="flow-step-content">
    <a class="tskb-ref" data-node-id="${escapeHtml(s.nodeId)}"${typeAttr}${displayAttr}>${escapeHtml(s.nodeId)}</a>
    ${labelHtml}
  </div>
</li>`;
      })
      .join("");
    return `<ol class="flow-steps">${items}</ol>`;
  }

  private showRefTooltip(
    liveNode: ExplorerNode | undefined,
    anchor: HTMLAnchorElement,
    nodeId: string
  ): void {
    const preloadLabel = anchor.getAttribute("data-node-display") ?? nodeId;
    const label = liveNode?.label || preloadLabel;
    const nodeType = liveNode?.type ?? anchor.getAttribute("data-node-type") ?? null;
    const color = nodeType
      ? (NODE_COLORS[nodeType as keyof typeof NODE_COLORS] ?? "#64748b")
      : "#64748b";
    showDomTooltip(label, liveNode?.path, liveNode?.description ?? "", color, anchor);
  }

  private renderDetail(node: PositionedNode): string {
    const rows = Object.entries(node.detail)
      .filter(([k]) => !k.startsWith("_") && k !== "html")
      .map(([k, v]) => {
        const val = Array.isArray(v) ? v.join(", ") : v;
        return `<tr><td class="dk">${escapeHtml(k)}</td><td class="dv">${escapeHtml(String(val))}</td></tr>`;
      })
      .join("");

    const descRow = node.description
      ? `<p class="detail-lead">${escapeHtml(node.description)}</p>`
      : "";

    return `${descRow}${rows ? `<table class="detail-table">${rows}</table>` : ""}`;
  }
}
