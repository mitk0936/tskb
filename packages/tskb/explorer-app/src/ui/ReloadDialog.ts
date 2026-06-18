// ─── ReloadDialog ──────────────────────────────────────────────────────────────
// Persistent bottom-center bar shown when the graph changes under a live server.
// "Reload" does a full page reload (re-fetches fresh chunks); ✕ just hides it.

let el: HTMLDivElement | null = null;

export function showReloadDialog(): void {
  if (el) {
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
    return;
  }

  el = document.createElement("div");
  el.id = "reload-dialog";
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%) translateY(8px)",
    display: "flex",
    alignItems: "center",
    gap: "12px",
    borderRadius: "8px",
    padding: "8px 10px 8px 14px",
    fontSize: "12px",
    fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    fontWeight: "500",
    whiteSpace: "nowrap",
    zIndex: "650",
    opacity: "0",
    transition: "opacity 0.15s ease, transform 0.15s ease",
    boxShadow: "0 4px 12px rgba(0,0,0,0.22)",
    background: "rgba(15,23,42,0.95)",
    color: "#f1f5f9",
  } as Partial<CSSStyleDeclaration>);

  const label = document.createElement("span");
  label.textContent = "Graph updated";

  const reloadBtn = document.createElement("button");
  reloadBtn.textContent = "Reload";
  Object.assign(reloadBtn.style, {
    cursor: "pointer",
    border: "none",
    borderRadius: "6px",
    padding: "4px 10px",
    fontSize: "12px",
    fontWeight: "600",
    background: "#3b82f6",
    color: "#fff",
  } as Partial<CSSStyleDeclaration>);
  reloadBtn.addEventListener("click", () => location.reload());

  const dismissBtn = document.createElement("button");
  dismissBtn.textContent = "✕";
  dismissBtn.setAttribute("aria-label", "Dismiss");
  Object.assign(dismissBtn.style, {
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "#94a3b8",
    fontSize: "13px",
    lineHeight: "1",
    padding: "2px 4px",
  } as Partial<CSSStyleDeclaration>);
  dismissBtn.addEventListener("click", () => hideReloadDialog());

  el.append(label, reloadBtn, dismissBtn);
  document.body.appendChild(el);

  // Trigger the fade-in on the next frame.
  requestAnimationFrame(() => {
    if (!el) return;
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
  });
}

export function hideReloadDialog(): void {
  if (!el) return;
  el.style.opacity = "0";
  el.style.transform = "translateX(-50%) translateY(8px)";
}
