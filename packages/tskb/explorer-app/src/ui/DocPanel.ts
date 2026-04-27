import "./doc-panel.css";
import type { PositionedNode, ExplorerNode } from "../types";
import { showDomTooltip, hideDomTooltip } from "./DomTooltip";
import { NODE_COLORS, exportDisplayLabel } from "../components/nodes/base";
import { showToast } from "./Toast";

export type OnNodeRefClick = (nodeId: string) => void;
export type GetNodeFn = (nodeId: string) => ExplorerNode | undefined;
export type OnNodeHighlightFn = (nodeId: string | null) => void;
export type OnNodePrefetchFn = (nodeId: string) => Promise<void>;

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

    document.getElementById("doc-panel-close")!.addEventListener("click", () => this.hide());

    this.title.addEventListener("click", () => {
      if (!this.title.dataset.copyable) return;
      const text = this.title.textContent ?? "";
      if (text) navigator.clipboard.writeText(text).then(() => showToast(`⎘ ${text}`));
    });

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
    this.title.textContent = node.path ?? node.label;
    this.title.dataset.copyable = "true";
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
    this.title.innerHTML =
      `<span class="title-kind-chip title-kind-${kind}">${kindLabel}</span>` +
      `<span class="title-refs-target">related to ${target}</span>`;
    delete this.title.dataset.copyable;
    this.title.dataset.refs = "true";
    this.body.innerHTML = this.renderAccordion(items, kind);
    this.wireRefLinks();
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

      const node = this.getNode?.(nodeId);
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
        a.title = node.path ?? nodeId;
      } else {
        // Node not loaded yet — use pre-computed display text embedded at build time
        a.textContent = a.getAttribute("data-node-display") ?? nodeId;
        a.title = nodeId;
      }

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

  private renderAccordion(items: ExplorerNode[], kind: "docs" | "flows"): string {
    if (items.length === 0) return `<p class="panel-empty">No ${kind} reference this node.</p>`;

    return items
      .map((item) => {
        const badge = item.priority
          ? `<span class="priority-badge priority-${item.priority}">${item.priority}</span>`
          : "";

        // Both docs and flows use description as the summary:
        //   docs  → explains text
        //   flows → flow desc
        const summaryText = item.description || item.label;

        let body: string;
        if (kind === "flows") {
          body = `<div class="accordion-body">${this.renderFlowSteps(item)}</div>`;
        } else {
          const html = item.detail.html as string | undefined;
          body = html
            ? `<div class="accordion-body">${html}</div>`
            : `<div class="accordion-body"><p>${item.description}</p></div>`;
        }

        return `<details class="accordion-item">
  <summary class="accordion-summary">${badge}<span class="accordion-label">${summaryText}</span></summary>
  ${body}
</details>`;
      })
      .join("");
  }

  private renderFlowSteps(item: ExplorerNode): string {
    const raw = item.detail.stepsJson as string | undefined;
    if (!raw) return `<p>${item.description}</p>`;
    let steps: Array<{ nodeId: string; label?: string }>;
    try {
      steps = JSON.parse(raw) as Array<{ nodeId: string; label?: string }>;
    } catch {
      return `<p>${item.description}</p>`;
    }
    if (steps.length === 0) return `<p>${item.description}</p>`;
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const items = steps
      .map((s) => {
        const label = s.label ? ` — ${esc(s.label)}` : "";
        const stepNode = this.getNode?.(s.nodeId);
        const typeAttr = stepNode ? ` data-node-type="${esc(stepNode.type)}"` : "";
        const display = stepNode ? (stepNode.path ?? s.nodeId) : s.nodeId;
        const displayAttr = ` data-node-display="${esc(display)}"`;
        return `<li><a class="tskb-ref" data-node-id="${esc(s.nodeId)}"${typeAttr}${displayAttr}>${esc(s.nodeId)}</a>${label}</li>`;
      })
      .join("");
    return `<div class="tskb-flow"><ol>${items}</ol></div>`;
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
        return `<tr><td class="dk">${k}</td><td class="dv">${val}</td></tr>`;
      })
      .join("");

    const descRow = node.description
      ? `<p style="margin:0 0 12px;color:#475569">${node.description}</p>`
      : "";

    return `${descRow}${rows ? `<table class="detail-table">${rows}</table>` : ""}`;
  }
}
