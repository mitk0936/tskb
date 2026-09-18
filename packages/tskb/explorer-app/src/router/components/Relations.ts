import type { GetNodeFn, OnRelationHighlightFn } from "../../types";

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface RelationsDeps {
  getNode: GetNodeFn;
  onRelationHighlight: OnRelationHighlightFn;
}

/**
 * Turns every `span.tskb-relation` carrier under `rootEl` into a visible
 * relation block: two stacked node chips (from over to) joined on the right by
 * a bracket and caption. The chips are `a.tskb-ref` anchors, so the host's
 * wireRefs() wiring makes them navigable and labels them — call this BEFORE
 * wireRefs so the anchors exist when it runs.
 *
 * The carrier span (built by the JSX extractor as an empty data holder) is
 * reused as the flex container; we only rewrite its contents, so calling this
 * more than once is safe.
 */
export function enhanceRelations(rootEl: HTMLElement, deps: RelationsDeps): void {
  rootEl.querySelectorAll<HTMLElement>("span.tskb-relation").forEach((span) => {
    const from = span.getAttribute("data-from") ?? "";
    const to = span.getAttribute("data-to") ?? "";
    if (!from || !to) return;

    const caption = span.getAttribute("data-label")?.trim() || "related";

    span.innerHTML =
      `<span class="tskb-relation-chips">` +
      chip(span, "from", deps) +
      chip(span, "to", deps) +
      `</span>` +
      `<span class="tskb-relation-connector">` +
      `<span class="tskb-relation-bracket" aria-hidden="true"></span>` +
      `<span class="tskb-relation-caption">${escapeHtml(caption)}</span>` +
      `</span>`;

    // Hovering the block highlights the matching relation arc on the canvas.
    // mouseenter/leave (not over/out) so moving between the inner chips doesn't
    // flicker the highlight.
    span.addEventListener("mouseenter", () => deps.onRelationHighlight({ from, to }));
    span.addEventListener("mouseleave", () => deps.onRelationHighlight(null));
  });
}

/**
 * One end of the relation as an `a.tskb-ref` anchor. Mirrors renderFlowSteps:
 * the anchor carries the node's type and display path so wireRefs can label it
 * (`Router.ts`, `views/`, `Router {...}`) — from the loaded node when there is
 * one, otherwise from the `data-<end>-type` / `data-<end>-display` attributes
 * the extractor pre-computed on the carrier.
 */
function chip(span: HTMLElement, end: "from" | "to", deps: RelationsDeps): string {
  const nodeId = span.getAttribute(`data-${end}`)!;
  const node = deps.getNode(nodeId);
  const type = node?.type ?? span.getAttribute(`data-${end}-type`);
  const display = node
    ? (node.path ?? node.label)
    : (span.getAttribute(`data-${end}-display`) ?? nodeId);
  const typeAttr = type ? ` data-node-type="${escapeHtml(type)}"` : "";
  return (
    `<a class="tskb-ref tskb-relation-chip" data-node-id="${escapeHtml(nodeId)}"` +
    `${typeAttr} data-node-display="${escapeHtml(display)}">${escapeHtml(nodeId)}</a>`
  );
}
