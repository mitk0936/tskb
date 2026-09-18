import type { View, ViewContext } from "../types";
import type { NodeRefHooks } from "../../types";
import { renderAccordion } from "../components/Accordion";
import { enhanceRelations } from "../components/Relations";
import { wireRefs, wireCopyButtons } from "../components/RefLinks";
import { shortNodeLabel } from "../components/NodeLabel";
import { exportDisplayLabel } from "../../components/nodes/base";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type RefsKind = "docs" | "flows";

/**
 * "Docs/Flows related to <node>" — accordion list of every doc or flow that
 * cross-references the given node. Instantiated per navigation with its own
 * deps; call the static parse() factory for hash restoration.
 */
export class RefsView implements View {
  static readonly prefix = "refs";

  get route(): string {
    return `${RefsView.prefix}/${encodeURIComponent(this.nodeId)}/${this.kind}`;
  }

  constructor(
    private readonly nodeId: string,
    private readonly kind: RefsKind,
    private readonly deps: NodeRefHooks
  ) {}

  static parse(rest: string, deps: NodeRefHooks): RefsView | null {
    const slash = rest.lastIndexOf("/");
    if (slash <= 0 || slash === rest.length - 1) return null;
    const rawId = rest.slice(0, slash);
    const kind = rest.slice(slash + 1);
    if (kind !== "docs" && kind !== "flows") return null;
    let nodeId: string;
    try {
      nodeId = decodeURIComponent(rawId);
    } catch {
      return null;
    }
    return new RefsView(nodeId, kind as RefsKind, deps);
  }

  renderHeader(headerEl: HTMLElement, _ctx: ViewContext): void {
    const node = this.deps.getNode(this.nodeId);
    const target = node?.path ?? node?.label ?? this.nodeId;
    const display = node
      ? node.type === "export"
        ? exportDisplayLabel(node.label, node.detail.morphology as string | undefined)
        : shortNodeLabel(node.type, target)
      : this.nodeId;
    const kindLabel = this.kind === "docs" ? "Docs" : "Flows";
    const targetLink =
      `<a class="tskb-ref title-refs-target-link" data-node-id="${escapeHtml(this.nodeId)}"` +
      ` data-node-display="${escapeHtml(target)}"` +
      ` data-no-rewrite title="Open ${escapeHtml(target)} in graph">${escapeHtml(display)}</a>`;
    headerEl.dataset.refs = "true";
    headerEl.dataset.refsRoute = this.route;
    headerEl.innerHTML =
      `<span class="title-kind-chip title-kind-${this.kind}">${kindLabel}</span>` +
      `<span class="title-refs-target">related to ${targetLink}</span>`;
    wireRefs(headerEl, this.deps);

    // A hash-restored view can render before the target's folder chunk is loaded,
    // leaving only the registry key to show. Fetch the chunk and repaint — but
    // only while this view still owns the header (the panel strips data-* attrs
    // when the active view changes).
    if (!node) {
      this.deps
        .onNodePrefetch(this.nodeId)
        .then(() => {
          if (headerEl.dataset.refsRoute !== this.route) return;
          if (this.deps.getNode(this.nodeId)) this.renderHeader(headerEl, _ctx);
        })
        .catch(() => {
          /* ignore prefetch errors — the registry key stays as the label */
        });
    }
  }

  renderBody(bodyEl: HTMLElement): void {
    const items = this.deps.getRefsFor(this.nodeId, this.kind);
    bodyEl.innerHTML = renderAccordion(items, this.kind, { getNode: this.deps.getNode });
    enhanceRelations(bodyEl, this.deps);
    wireRefs(bodyEl, this.deps);
    wireCopyButtons(bodyEl);
  }
}
