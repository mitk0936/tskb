import type { ExplorerNode } from "../../types";
import type { GetNodeFn } from "../../types";

const PRIORITY_RANK: Record<string, number> = {
  essential: 0,
  constraint: 1,
  supplementary: 2,
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface AccordionDeps {
  getNode: GetNodeFn;
}

/**
 * Renders a list of doc/flow refs as `<details>` accordions. The first item is
 * open by default; the rest collapsed. Pure HTML — clicks on the embedded
 * `a.tskb-ref` anchors are handled by the host's wireRefs() wiring.
 */
export function renderAccordion(
  items: ExplorerNode[],
  kind: "docs" | "flows",
  deps: AccordionDeps
): string {
  if (items.length === 0) {
    return `<p class="panel-empty">No ${kind} reference this node.</p>`;
  }

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
      const summaryHeadline = `<span class="accordion-headline">${escapeHtml(headline)}</span>`;

      const pathLink =
        `<a class="tskb-ref accordion-path-ref" data-node-id="${escapeHtml(item.id)}"` +
        ` data-node-display="${escapeHtml(pathText)}"` +
        ` data-no-rewrite title="Open ${escapeHtml(pathText)} in graph">${escapeHtml(pathText)}</a>`;
      const copyBtn =
        `<button type="button" class="accordion-path-copy"` +
        ` data-copy-path="${escapeHtml(pathText)}"` +
        ` title="Copy path" aria-label="Copy path">` +
        `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
        ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
        `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>` +
        `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>` +
        `</svg>` +
        `</button>`;
      const pathRow = `<div class="accordion-path">${pathLink}${copyBtn}</div>`;

      let body: string;
      if (kind === "flows") {
        body = `<div class="accordion-body">${pathRow}${renderFlowSteps(item, deps)}</div>`;
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

function renderFlowSteps(item: ExplorerNode, deps: AccordionDeps): string {
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
      const stepNode = deps.getNode(s.nodeId);
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
