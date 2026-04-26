// ─── DomTooltip ──────────────────────────────────────────────────────────────
// Lightweight tooltip anchored to any DOM element.
// Has no dependency on the SVG canvas, zoom transforms, or svgRect.
// Used by DocPanel ref links; NodeTooltip remains SVG-only.

let el: HTMLDivElement | null = null;
let raf = 0;

export function mountDomTooltip(): void {
  el = document.createElement("div");
  el.id = "dom-tooltip";
  Object.assign(el.style, {
    position: "fixed",
    display: "none",
    pointerEvents: "none",
    zIndex: "500",
    opacity: "0",
    transform: "translateY(-4px)",
    transition: "opacity 0.12s ease, transform 0.12s ease",
  });
  document.body.appendChild(el);
}

export function showDomTooltip(
  label: string,
  path: string | undefined,
  description: string,
  color: string,
  anchorEl: HTMLElement
): void {
  if (!el) return;
  buildContent(label, path, description, color);
  el.style.display = "block";
  // Reading offsetWidth after display=block forces synchronous reflow → correct dimensions
  positionAbove(anchorEl);
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    if (el) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0)";
    }
  });
}

export function hideDomTooltip(): void {
  if (!el) return;
  cancelAnimationFrame(raf);
  el.style.opacity = "0";
  el.style.transform = "translateY(-4px)";
  setTimeout(() => {
    if (el && el.style.opacity === "0") el.style.display = "none";
  }, 120);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildContent(
  label: string,
  path: string | undefined,
  description: string,
  color: string
): void {
  if (!el) return;
  const hasExtra = !!(description || path);
  const nameLine =
    `<div style="display:flex;align-items:center;gap:5px;margin-bottom:${hasExtra ? "4px" : "0"}">` +
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
    `<div style="background:#f1f5f9;border:1px solid #e2e8f0;border-radius:16px;padding:9px 14px;` +
    `box-shadow:0 2px 12px rgba(0,0,0,0.06);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">` +
    `${nameLine}${pathLine}${descLine}</div>`;
}

function positionAbove(anchorEl: HTMLElement): void {
  if (!el) return;
  const r = anchorEl.getBoundingClientRect();
  const W = el.offsetWidth || 240;
  const H = el.offsetHeight || 60;
  const GAP = 6;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
  const top = Math.max(8, r.top - H - GAP);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
