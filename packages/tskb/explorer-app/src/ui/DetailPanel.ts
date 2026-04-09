import type { PositionedNode } from "../types";
import { NODE_COLORS, NODE_ICON } from "../components/nodes/base";

/**
 * Detail panel — sketch for MVP.
 * Shows node id, type, description, and key detail fields.
 * Full morphology / edge explorer left for future iteration.
 */
export function mountDetailPanel(onClose: () => void): {
  show: (node: PositionedNode) => void;
  hide: () => void;
} {
  const panel = document.getElementById("detail-panel")!;
  const typeBadge = document.getElementById("dp-type-badge")!;
  const title = document.getElementById("dp-title")!;
  const body = document.getElementById("dp-body")!;
  const closeBtn = document.getElementById("dp-close")!;

  closeBtn.addEventListener("click", () => {
    hide();
    onClose();
  });

  function show(node: PositionedNode): void {
    const color = NODE_COLORS[node.type];

    typeBadge.textContent = `${NODE_ICON[node.type]} ${node.type}`;
    typeBadge.style.cssText = `background:${color}22; color:${color}; border:1px solid ${color}55`;

    title.textContent = node.label;

    body.innerHTML = "";

    // Core fields
    addField("ID", `<code>${node.id}</code>`);
    if (node.description) addField("Description", node.description);
    if (node.path) addField("Path", `<code>${node.path}</code>`);
    if (node.priority) addField("Priority", node.priority);
    if (node.edgeCount > 0) addField("Connections", String(node.edgeCount));

    // Extra detail fields
    const skip = new Set(["_hasChildren"]);
    for (const [key, value] of Object.entries(node.detail)) {
      if (skip.has(key)) continue;
      const display = Array.isArray(value) ? value.join(", ") : value;
      if (display) addField(key, display);
    }

    // Sketch placeholder for future sections
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="sketch-note">
        ✦ Edges, morphology, and related nodes — coming in a future iteration.
      </div>`
    );

    panel.classList.add("open");
  }

  function hide(): void {
    panel.classList.remove("open");
  }

  function addField(label: string, html: string): void {
    body.insertAdjacentHTML(
      "beforeend",
      `<div class="field">
        <div class="field-label">${label}</div>
        <div class="field-value">${html}</div>
      </div>`
    );
  }

  return { show, hide };
}
