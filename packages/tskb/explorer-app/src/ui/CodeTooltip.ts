// ─── CodeTooltip ─────────────────────────────────────────────────────────────
// Click-toggled code preview popup. Opened by the <> bubble on module/file nodes.
// Closed by × button, clicking the bubble again, or clicking outside.
// Repositions itself on zoom/pan so it tracks the anchor node.

import { createHeaderButton, copyToClipboard } from "./HeaderActions";

let el: HTMLDivElement | null = null;
let activeNodeId: string | null = null;
let outsideHandler: ((e: MouseEvent) => void) | null = null;

// SVG-space anchor for the popup (set when opened, used to reposition on zoom)
let anchorSvgX = 0;
let anchorSvgY = 0;
let currentTransform = { k: 1, x: 0, y: 0 };
let svgRect: DOMRect | null = null;

export function mountCodeTooltip(svgEl: SVGSVGElement): void {
  svgRect = svgEl.getBoundingClientRect();
  new ResizeObserver(() => {
    svgRect = svgEl.getBoundingClientRect();
  }).observe(svgEl);

  el = document.createElement("div");
  el.id = "code-tooltip";
  Object.assign(el.style, {
    position: "fixed",
    display: "none",
    flexDirection: "column",
    width: "620px",
    maxWidth: "90vw",
    maxHeight: "80vh",
    minWidth: "260px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
    zIndex: "500",
    opacity: "0",
    transform: "translateY(4px) scale(0.98)",
    transition: "opacity 0.15s ease, transform 0.15s ease",
    userSelect: "text",
  });
  document.body.appendChild(el);

  const style = document.createElement("style");
  style.textContent = HLJS_CSS;
  document.head.appendChild(style);
}

/**
 * Called from main.ts on every zoom event so the popup tracks its anchor node.
 * Also refreshes svgRect in case the window was resized.
 */
export function updateCodeTooltipTransform(
  transform: { k: number; x: number; y: number },
  rect: DOMRect
): void {
  currentTransform = transform;
  svgRect = rect;
  if (activeNodeId) positionFromSvg();
}

/** Toggle: same node → hide; otherwise show anchored to the node's SVG position. */
export async function toggleCodeTooltip(
  nodeId: string,
  codeLines: string[],
  path: string,
  svgX: number,
  svgY: number,
  importLines?: string[],
  language?: string
): Promise<void> {
  if (activeNodeId === nodeId) {
    hideCodeTooltip();
    return;
  }
  activeNodeId = nodeId;
  anchorSvgX = svgX;
  anchorSvgY = svgY;

  let codeContent = "";
  if (importLines?.length) {
    codeContent += importLines.map((l) => `import ${l}`).join("\n") + "\n\n";
  }
  codeContent += codeLines.join("\n");

  const hljs = await hljsReady;
  // Guard: tooltip may have been closed while awaiting the highlight chunk
  if (activeNodeId !== nodeId) return;

  const lang = language ?? "javascript";
  const highlighted = hljs.highlight(codeContent, { language: lang, ignoreIllegals: true }).value;

  if (!el) return;
  el.innerHTML =
    `<div class="code-tooltip-header" style="` +
    `padding:5px 6px 5px 14px;` +
    `background:#f8fafc;` +
    `border-bottom:1px solid #e2e8f0;` +
    `display:flex;align-items:center;gap:4px;` +
    `">` +
    `<span style="` +
    `min-width:0;` +
    `font-size:12px;color:#94a3b8;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;` +
    `letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` +
    `">${escHtml(path)}</span>` +
    `<div class="header-actions" data-slot="path"></div>` +
    `<div style="flex:1"></div>` +
    `<div class="header-actions" data-slot="end"></div>` +
    `</div>` +
    `<pre style="` +
    `margin:0;` +
    `padding:10px 16px 12px;` +
    `overflow:auto;` +
    `white-space:pre;` +
    `font-family:'Cascadia Code','JetBrains Mono','Fira Code',monospace;` +
    `font-size:11px;` +
    `line-height:1.7;` +
    `color:#1e293b;` +
    `flex:1;min-height:0;` +
    `user-select:text;` +
    `"><code>${highlighted}</code></pre>`;

  const pathSlot = el.querySelector<HTMLDivElement>('.header-actions[data-slot="path"]')!;
  pathSlot.appendChild(
    createHeaderButton("copy", {
      title: `Copy ${path}`,
      onClick: () => copyToClipboard(path),
    })
  );
  const endSlot = el.querySelector<HTMLDivElement>('.header-actions[data-slot="end"]')!;
  endSlot.appendChild(
    createHeaderButton("close", { title: "Close", onClick: () => hideCodeTooltip() })
  );

  el.style.display = "flex";
  positionFromSvg();
  requestAnimationFrame(() => {
    if (el) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0) scale(1)";
    }
  });

  // Register outside-click handler after current event loop tick so the
  // opening click doesn't immediately trigger it.
  if (outsideHandler) document.removeEventListener("mousedown", outsideHandler, true);
  outsideHandler = (e: MouseEvent) => {
    if (el && !el.contains(e.target as Node)) hideCodeTooltip();
  };
  setTimeout(() => {
    if (outsideHandler) document.addEventListener("mousedown", outsideHandler, true);
  }, 0);
}

export function hideCodeTooltip(): void {
  if (!el) return;
  activeNodeId = null;
  if (outsideHandler) {
    document.removeEventListener("mousedown", outsideHandler, true);
    outsideHandler = null;
  }
  el.style.opacity = "0";
  el.style.transform = "translateY(4px) scale(0.98)";
  setTimeout(() => {
    if (el && !activeNodeId) el.style.display = "none";
  }, 150);
}

// ─── Positioning ──────────────────────────────────────────────────────────────

function positionFromSvg(): void {
  if (!svgRect) return;
  // Convert SVG anchor coords → screen coords using current transform
  const screenX = anchorSvgX * currentTransform.k + currentTransform.x + svgRect.left;
  const screenY = anchorSvgY * currentTransform.k + currentTransform.y + svgRect.top;
  positionAt(screenX, screenY);
}

function positionAt(x: number, y: number): void {
  if (!el) return;
  const GAP = 14;
  const W = el.offsetWidth || 620;
  const H = el.offsetHeight || 220;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = x + GAP + W > vw - 8 ? x - W - GAP : x + GAP;
  const top = y + GAP + H > vh - 8 ? y - H - GAP : y + GAP;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

// ─── Syntax highlighter (highlight.js, lazy-loaded) ──────────────────────────

// Starts fetching the highlight chunk at SPA boot (parallel to other init).
// By the time a user clicks <>, this promise is resolved.
const hljsReady = (async () => {
  const [
    { default: hljs },
    { default: json },
    { default: yaml },
    { default: sql },
    { default: dockerfile },
    { default: xml },
    { default: css },
    { default: bash },
    { default: graphql },
    { default: javascript },
    { default: markdown },
  ] = await Promise.all([
    import("highlight.js/lib/core"),
    import("highlight.js/lib/languages/json"),
    import("highlight.js/lib/languages/yaml"),
    import("highlight.js/lib/languages/sql"),
    import("highlight.js/lib/languages/dockerfile"),
    import("highlight.js/lib/languages/xml"),
    import("highlight.js/lib/languages/css"),
    import("highlight.js/lib/languages/bash"),
    import("highlight.js/lib/languages/graphql"),
    import("highlight.js/lib/languages/javascript"),
    import("highlight.js/lib/languages/markdown"),
  ]);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("dockerfile", dockerfile);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("html", xml); // html files use the xml grammar
  hljs.registerLanguage("css", css);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("graphql", graphql);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("markdown", markdown);
  return hljs;
})();

// GitHub-light token colours — injected once into <head> by mountCodeTooltip.
const HLJS_CSS = `
.hljs-comment,.hljs-quote{color:#6a737d;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-subst{color:#d73a49}
.hljs-number,.hljs-literal{color:#005cc5}
.hljs-string,.hljs-regexp,.hljs-addition,.hljs-meta-string{color:#032f62}
.hljs-doctag{color:#d73a49}
.hljs-title,.hljs-section{color:#6f42c1}
.hljs-built_in,.hljs-tag,.hljs-name{color:#22863a}
.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-type{color:#005cc5}
.hljs-symbol,.hljs-bullet,.hljs-link{color:#0366d6}
.hljs-deletion{color:#b31d28;background:#ffeef0}
.hljs-emphasis{font-style:italic}
.hljs-strong{font-weight:bold}
`;

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
