// ─── HeaderActions ───────────────────────────────────────────────────────────
// Shared factories for copy/close buttons used in panel and tooltip headers.

import "./header-actions.css";
import { showToast } from "./Toast";

export type HeaderActionKind = "copy" | "close" | "back";

export interface HeaderButtonOptions {
  title: string;
  onClick: () => void;
  hidden?: boolean;
}

const COPY_ICON =
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
  ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>` +
  `<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>` +
  `</svg>`;

const BACK_ICON =
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
  ` stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M15 18l-6-6 6-6"></path>` +
  `</svg>`;

const CLOSE_GLYPH = "✕";

const ICONS: Record<HeaderActionKind, string> = {
  copy: COPY_ICON,
  close: CLOSE_GLYPH,
  back: BACK_ICON,
};

export function createHeaderButton(
  kind: HeaderActionKind,
  options: HeaderButtonOptions
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `header-action-btn header-action-${kind}`;
  btn.title = options.title;
  btn.innerHTML = ICONS[kind];
  if (options.hidden) btn.hidden = true;
  btn.addEventListener("click", options.onClick);
  return btn;
}

/** Copy text to the clipboard and flash a toast on success. */
export function copyToClipboard(text: string, toastLabel?: string): void {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showToast(`⎘ ${toastLabel ?? text}`);
  });
}
