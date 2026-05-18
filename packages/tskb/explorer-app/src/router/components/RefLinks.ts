import { showDomTooltip, hideDomTooltip } from "../../ui/DomTooltip";
import { NODE_COLORS, exportDisplayLabel } from "../../components/nodes/base";
import type { ExplorerNode } from "../../types";
import type { GetNodeFn, OnNodeHighlightFn, OnNodePrefetchFn, OnNodeRefClick } from "../../types";

interface RefLinksDeps {
  getNode: GetNodeFn;
  onNodeRef: OnNodeRefClick;
  onNodeHighlight: OnNodeHighlightFn;
  onNodePrefetch: OnNodePrefetchFn;
}

const HANDLER_KEY = "__tskbRefClickHandler";

interface RootWithHandler extends HTMLElement {
  [HANDLER_KEY]?: (e: MouseEvent) => void;
}

/**
 * Wires every `a.tskb-ref` under `rootEl`:
 *   - click → onNodeRef (delegated, idempotent across renders)
 *   - hover → DomTooltip + graph highlight, with chunk prefetch fallback
 *   - text  → rewritten to the live node's display label, unless the anchor
 *             carries `data-no-rewrite` (used by accordion headers / title chips
 *             that already include badges or kind chips).
 */
export function wireRefs(rootEl: HTMLElement, deps: RefLinksDeps): void {
  const root = rootEl as RootWithHandler;

  const previous = root[HANDLER_KEY];
  if (previous) root.removeEventListener("click", previous);
  const handler = (e: MouseEvent): void => {
    const anchor = (e.target as Element | null)?.closest("a.tskb-ref");
    if (!anchor) return;
    e.preventDefault();
    const nodeId = anchor.getAttribute("data-node-id");
    if (nodeId) deps.onNodeRef(nodeId);
  };
  root.addEventListener("click", handler);
  root[HANDLER_KEY] = handler;

  root.querySelectorAll<HTMLAnchorElement>("a.tskb-ref").forEach((a) => {
    const nodeId = a.getAttribute("data-node-id");
    if (!nodeId) return;

    const skipTextRewrite = a.hasAttribute("data-no-rewrite");
    const node = deps.getNode(nodeId);
    if (!skipTextRewrite) {
      a.textContent = displayFor(node, a, nodeId);
    }
    a.title = node?.path ?? nodeId;

    let hovering = false;
    a.addEventListener("mouseenter", () => {
      hovering = true;
      const liveNode = deps.getNode(nodeId) ?? node;
      showRefTooltip(liveNode, a, nodeId);
      deps.onNodeHighlight(nodeId);

      if (!liveNode) {
        deps
          .onNodePrefetch(nodeId)
          .then(() => {
            if (!hovering) return;
            const fresh = deps.getNode(nodeId);
            if (fresh) showRefTooltip(fresh, a, nodeId);
          })
          .catch(() => {
            /* ignore prefetch errors */
          });
      }
    });
    a.addEventListener("mouseleave", () => {
      hovering = false;
      hideDomTooltip();
      deps.onNodeHighlight(null);
    });
  });
}

function displayFor(
  node: ExplorerNode | undefined,
  anchor: HTMLAnchorElement,
  nodeId: string
): string {
  if (!node) {
    return anchor.getAttribute("data-node-display") ?? nodeId;
  }
  if (node.type === "export") {
    return exportDisplayLabel(node.label, node.detail.morphology as string | undefined);
  }
  if (node.type === "folder") {
    return (node.path ?? node.label) + "/";
  }
  return node.path ?? node.label;
}

function showRefTooltip(
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
