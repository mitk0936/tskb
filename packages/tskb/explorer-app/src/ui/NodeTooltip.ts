// ─── NodeTooltip ─────────────────────────────────────────────────────────────
// Hover label popup anchored to the node's SVG position.
// Repositions on zoom/pan so it tracks the node it belongs to.

let el: HTMLDivElement | null = null;
let raf = 0;

let anchorSvgX = 0;
let anchorSvgY = 0;
let currentTransform = { k: 1, x: 0, y: 0 };
let svgRect: DOMRect | null = null;

export function mountNodeTooltip(svgEl: SVGSVGElement): void {
  svgRect = svgEl.getBoundingClientRect();
  new ResizeObserver(() => {
    svgRect = svgEl.getBoundingClientRect();
  }).observe(svgEl);

  el = document.createElement("div");
  el.id = "node-tooltip";
  Object.assign(el.style, {
    position: "fixed",
    display: "none",
    pointerEvents: "none",
    zIndex: "400",
    opacity: "0",
    transform: "translateY(6px)",
    transition: "opacity 0.12s ease, transform 0.12s ease",
  });
  document.body.appendChild(el);
}

export function showNodeTooltip(
  label: string,
  path: string | undefined,
  description: string,
  color: string,
  svgX: number,
  svgY: number
): void {
  if (!el) return;

  anchorSvgX = svgX;
  anchorSvgY = svgY;

  const nameLine =
    `<div style="display:flex;align-items:center;gap:5px;margin-bottom:${description || path ? "4px" : "0"}">` +
    `<span style="width:6px;height:6px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>` +
    `<span style="font-size:16px;font-weight:700;color:#0f172a;white-space:nowrap;">${escHtml(label)}</span>` +
    `</div>`;

  const pathLine = path
    ? `<div style="font-size:13px;color:#94a3b8;font-family:monospace;margin-bottom:${description ? "4px" : "0"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${escHtml(path)}</div>`
    : "";

  const descLine = description
    ? `<div style="font-size:12px;color:#64748b;line-height:1.5;max-width:220px;">${escHtml(description)}</div>`
    : "";

  el.innerHTML =
    `<div style="` +
    `background:#f1f5f9;` +
    `border:1px solid #e2e8f0;` +
    `border-radius:16px;` +
    `padding:9px 14px;` +
    `box-shadow:0 2px 12px rgba(0,0,0,0.06);` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;` +
    `">${nameLine}${pathLine}${descLine}</div>`;

  el.style.display = "block";
  positionFromSvg();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (el) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }
  });
}

/** Called on zoom/pan — repositions the tooltip to track its node. */
export function updateNodeTooltipTransform(
  transform: { k: number; x: number; y: number },
  rect: DOMRect
): void {
  currentTransform = transform;
  svgRect = rect;
  if (el && el.style.display !== "none") positionFromSvg();
}

export function hideNodeTooltip(): void {
  if (!el) return;
  cancelAnimationFrame(raf);
  el.style.opacity = "0";
  el.style.transform = "translateY(6px)";
  setTimeout(() => {
    if (el && el.style.opacity === "0") el.style.display = "none";
  }, 120);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function positionFromSvg(): void {
  if (!el || !svgRect) return;
  const screenX = anchorSvgX * currentTransform.k + currentTransform.x + svgRect.left;
  const screenY = anchorSvgY * currentTransform.k + currentTransform.y + svgRect.top;
  const GAP = 14;
  const W = el.offsetWidth || 240;
  const H = el.offsetHeight || 80;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = screenX - W - GAP;
  const top = screenY - H / 2;
  el.style.left = `${Math.max(8, Math.min(left, vw - W - 8))}px`;
  el.style.top = `${Math.max(8, Math.min(top, vh - H - 8))}px`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
