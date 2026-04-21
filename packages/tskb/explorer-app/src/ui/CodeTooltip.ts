// ─── CodeTooltip ─────────────────────────────────────────────────────────────
// Click-toggled code preview popup. Opened by the <> bubble on module nodes.
// Closed only via the × button in the header or by clicking the bubble again.
// Repositions itself on zoom/pan so it tracks the anchor node.

let el: HTMLDivElement | null = null;
let activeNodeId: string | null = null;

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
    maxWidth: "460px",
    minWidth: "200px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)",
    zIndex: "500",
    overflow: "hidden",
    opacity: "0",
    transform: "translateY(4px) scale(0.98)",
    transition: "opacity 0.15s ease, transform 0.15s ease",
  });
  document.body.appendChild(el);
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
export function toggleCodeTooltip(
  nodeId: string,
  codeLines: string[],
  path: string,
  svgX: number,
  svgY: number,
  importLines?: string[]
): void {
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

  if (!el) return;
  el.innerHTML =
    `<div style="` +
    `padding:5px 8px 5px 14px;` +
    `background:#f8fafc;` +
    `border-bottom:1px solid #e2e8f0;` +
    `display:flex;align-items:center;gap:8px;` +
    `">` +
    `<span style="` +
    `flex:1;min-width:0;` +
    `font-size:10px;color:#94a3b8;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;` +
    `letter-spacing:0.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;` +
    `">${escHtml(path)}</span>` +
    `<button id="code-tooltip-close" style="` +
    `flex-shrink:0;border:none;background:none;cursor:pointer;` +
    `color:#94a3b8;font-size:14px;line-height:1;padding:2px 4px;border-radius:4px;` +
    `" title="Close">×</button>` +
    `</div>` +
    `<pre style="` +
    `margin:0;` +
    `padding:10px 16px 12px;` +
    `overflow-x:auto;` +
    `white-space:pre;` +
    `font-family:'Cascadia Code','JetBrains Mono','Fira Code',monospace;` +
    `font-size:11px;` +
    `line-height:1.7;` +
    `color:#1e293b;` +
    `"><code>${highlight(codeContent)}</code></pre>`;

  el.style.display = "block";
  positionFromSvg();
  const closeBtn = el.querySelector<HTMLButtonElement>("#code-tooltip-close");
  if (closeBtn) closeBtn.onclick = () => hideCodeTooltip();
  requestAnimationFrame(() => {
    if (el) {
      el.style.opacity = "1";
      el.style.transform = "translateY(0) scale(1)";
    }
  });
}

export function hideCodeTooltip(): void {
  if (!el) return;
  activeNodeId = null;
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
  const W = el.offsetWidth || 460;
  const H = el.offsetHeight || 220;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = x + GAP + W > vw - 8 ? x - W - GAP : x + GAP;
  const top = y + GAP + H > vh - 8 ? y - H - GAP : y + GAP;
  el.style.left = `${Math.max(8, left)}px`;
  el.style.top = `${Math.max(8, top)}px`;
}

// ─── Syntax highlighter (inline TS tokenizer) ─────────────────────────────────

const KW = new Set([
  "export",
  "import",
  "from",
  "default",
  "class",
  "interface",
  "type",
  "function",
  "const",
  "let",
  "var",
  "extends",
  "implements",
  "return",
  "async",
  "await",
  "readonly",
  "public",
  "private",
  "protected",
  "static",
  "new",
  "this",
  "void",
  "null",
  "undefined",
  "true",
  "false",
  "as",
  "of",
  "in",
  "declare",
  "abstract",
  "override",
  "namespace",
  "enum",
  "keyof",
  "typeof",
  "infer",
  "never",
  "unknown",
  "any",
  "string",
  "number",
  "boolean",
  "symbol",
  "object",
  "bigint",
]);

const C = {
  kw: "color:#7c3aed",
  type: "color:#0891b2",
  str: "color:#16a34a",
  cmt: "color:#94a3b8;font-style:italic",
  num: "color:#ea580c",
  punc: "color:#64748b",
};

function sp(style: string, text: string): string {
  return `<span style="${style}">${text}</span>`;
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlight(code: string): string {
  let out = "";
  let i = 0;

  while (i < code.length) {
    const ch = code[i];

    // Line comment
    if (ch === "/" && code[i + 1] === "/") {
      const end = code.indexOf("\n", i);
      const val = end === -1 ? code.slice(i) : code.slice(i, end);
      out += sp(C.cmt, escHtml(val));
      i += val.length;
      continue;
    }

    // Block comment
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const val = end === -1 ? code.slice(i) : code.slice(i, end + 2);
      out += sp(C.cmt, escHtml(val));
      i += val.length;
      continue;
    }

    // String / template literals
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === "\\") {
          j += 2;
          continue;
        }
        if (code[j] === ch) {
          j++;
          break;
        }
        j++;
      }
      out += sp(C.str, escHtml(code.slice(i, j)));
      i = j;
      continue;
    }

    // Identifiers — keywords / types / plain names
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (KW.has(word)) {
        out += sp(C.kw, escHtml(word));
      } else if (/^[A-Z]/.test(word)) {
        out += sp(C.type, escHtml(word));
      } else {
        out += escHtml(word);
      }
      i = j;
      continue;
    }

    // Numeric literals
    if (/[0-9]/.test(ch)) {
      let j = i + 1;
      while (j < code.length && /[0-9._xXbBoO]/.test(code[j])) j++;
      out += sp(C.num, escHtml(code.slice(i, j)));
      i = j;
      continue;
    }

    // Arrow => as a single token
    if (ch === "=" && code[i + 1] === ">") {
      out += sp(C.punc, "=&gt;");
      i += 2;
      continue;
    }

    // Punctuation & operators
    if (/[{}()[\]<>,:;|&?=!+\-*/%~^@]/.test(ch)) {
      out += sp(C.punc, escHtml(ch));
      i++;
      continue;
    }

    // Whitespace and anything else
    out += escHtml(ch);
    i++;
  }

  return out;
}
