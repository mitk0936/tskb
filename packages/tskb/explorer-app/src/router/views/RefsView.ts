import type { View, ViewContext } from "../types";
import type { NodeRefHooks } from "../../types";
import { renderAccordion } from "../components/Accordion";
import { wireRefs } from "../components/RefLinks";

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
    const kindLabel = this.kind === "docs" ? "Docs" : "Flows";
    const targetLink =
      `<a class="tskb-ref title-refs-target-link" data-node-id="${escapeHtml(this.nodeId)}"` +
      ` data-node-display="${escapeHtml(target)}"` +
      ` data-no-rewrite title="Open ${escapeHtml(target)} in graph">${escapeHtml(target)}</a>`;
    headerEl.dataset.refs = "true";
    headerEl.innerHTML =
      `<span class="title-kind-chip title-kind-${this.kind}">${kindLabel}</span>` +
      `<span class="title-refs-target">related to ${targetLink}</span>`;
    wireRefs(headerEl, this.deps);
  }

  renderBody(bodyEl: HTMLElement): void {
    const items = this.deps.getRefsFor(this.nodeId, this.kind);
    bodyEl.innerHTML = renderAccordion(items, this.kind, { getNode: this.deps.getNode });
    wireRefs(bodyEl, this.deps);
  }
}
