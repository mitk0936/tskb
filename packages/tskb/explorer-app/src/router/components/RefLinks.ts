import { showDomTooltip, hideDomTooltip } from "../../ui/DomTooltip";
import { copyToClipboard } from "../../ui/HeaderActions";
import { NODE_COLORS, exportDisplayLabel } from "../../components/nodes/base";
import { shortNodeLabel } from "./NodeLabel";
import type { ExplorerNode } from "../../types";
import type { GetNodeFn, OnNodeHighlightFn, OnNodePrefetchFn, OnNodeRefClick } from "../../types";

interface RefLinksDeps {
  getNode: GetNodeFn;
  onNodeRef: OnNodeRefClick;
  onNodeHighlight: OnNodeHighlightFn;
  onNodePrefetch: OnNodePrefetchFn;
}

const HANDLER_KEY = "__tskbRefClickHandler";
const COPY_HANDLER_KEY = "__tskbCopyClickHandler";

interface RootWithHandler extends HTMLElement {
  [HANDLER_KEY]?: (e: MouseEvent) => void;
  [COPY_HANDLER_KEY]?: (e: MouseEvent) => void;
}

/**
 * Wires every `a.tskb-ref` under `rootEl`:
 *   - click → onNodeRef (delegated, idempotent across renders)
 *   - hover → DomTooltip + graph highlight, with chunk prefetch fallback
 *   - text  → rewritten to the node's short display label (see displayFor),
 *             unless the anchor carries `data-no-rewrite` (used by accordion
 *             headers / title chips that already include badges or kind chips).
 *             Refs whose label lives only on the node (exports) are prefetched
 *             and relabelled in place once their chunk lands.
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

  const unlabelled: HTMLAnchorElement[] = [];
  root.querySelectorAll<HTMLAnchorElement>("a.tskb-ref").forEach((a) => {
    const nodeId = a.getAttribute("data-node-id");
    if (!nodeId) return;

    const skipTextRewrite = a.hasAttribute("data-no-rewrite");
    const node = deps.getNode(nodeId);
    if (!skipTextRewrite) {
      a.textContent = displayFor(node, a, nodeId);
      if (!node && needsNodeForLabel(a)) unlabelled.push(a);
    }
    a.title = node?.path ?? a.getAttribute("data-node-display") ?? nodeId;

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

  relabelWhenLoaded(unlabelled, deps);
}

/**
 * Module, file and folder anchors carry a path in `data-node-display`, so they
 * read well before their chunk loads. An export's label (and the morphology
 * behind `Router {...}`) exists only on the node itself.
 */
function needsNodeForLabel(anchor: HTMLAnchorElement): boolean {
  const type = anchor.getAttribute("data-node-type");
  return !type || type === "export";
}

/**
 * Prefetches the chunks behind `anchors` (the loader collapses duplicate folder
 * requests) and rewrites each anchor's text once its node is available. Touches
 * only the anchors, so open accordions and scroll position survive.
 */
function relabelWhenLoaded(anchors: HTMLAnchorElement[], deps: RefLinksDeps): void {
  if (anchors.length === 0) return;
  const ids = new Set(anchors.map((a) => a.getAttribute("data-node-id")!));
  void Promise.all([...ids].map((id) => deps.onNodePrefetch(id).catch(() => undefined))).then(
    () => {
      for (const a of anchors) {
        if (!a.isConnected) continue;
        const nodeId = a.getAttribute("data-node-id")!;
        const node = deps.getNode(nodeId);
        if (!node) continue;
        a.textContent = displayFor(node, a, nodeId);
        a.title = node.path ?? a.title;
      }
    }
  );
}

/**
 * Wires every `button[data-copy-path]` under `rootEl`. Uses delegated, idempotent
 * click handling on the root — safe to call after every re-render. Copies the
 * `data-copy-path` value to the clipboard and flashes a toast on success.
 */
export function wireCopyButtons(rootEl: HTMLElement): void {
  const root = rootEl as RootWithHandler;
  const previous = root[COPY_HANDLER_KEY];
  if (previous) root.removeEventListener("click", previous);
  const handler = (e: MouseEvent): void => {
    const btn = (e.target as Element | null)?.closest("button[data-copy-path]");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const path = btn.getAttribute("data-copy-path");
    if (path) copyToClipboard(path, path);
  };
  root.addEventListener("click", handler);
  root[COPY_HANDLER_KEY] = handler;
}

/**
 * Short label for a ref anchor. Exports carry their morphology (`Router {...}`,
 * `mount(...)`); modules, files and folders show their last path segment. When
 * the node's chunk is not loaded yet, the anchor's pre-computed
 * `data-node-type` / `data-node-display` (a path for module/file/folder refs)
 * stand in, so an unloaded module still reads `Router.ts` rather than its
 * registry key.
 */
function displayFor(
  node: ExplorerNode | undefined,
  anchor: HTMLAnchorElement,
  nodeId: string
): string {
  if (node?.type === "export") {
    return exportDisplayLabel(node.label, node.detail.morphology as string | undefined);
  }
  const type = node?.type ?? anchor.getAttribute("data-node-type");
  const display = node
    ? (node.path ?? node.label)
    : (anchor.getAttribute("data-node-display") ?? nodeId);
  return shortNodeLabel(type, display);
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
