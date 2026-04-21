// ─── Toast ────────────────────────────────────────────────────────────────────
// Lightweight copy-confirmation toast. Bottom-center, auto-dismisses after 2s.

let el: HTMLDivElement | null = null;
let hideTimer = 0;

export function showToast(message: string): void {
  if (!el) {
    el = document.createElement("div");
    el.id = "copy-toast";
    Object.assign(el.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(8px)",
      background: "rgba(15,23,42,0.90)",
      color: "#f1f5f9",
      borderRadius: "8px",
      padding: "7px 14px",
      fontSize: "12px",
      fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      fontWeight: "500",
      whiteSpace: "nowrap",
      pointerEvents: "none",
      zIndex: "600",
      opacity: "0",
      transition: "opacity 0.15s ease, transform 0.15s ease",
      boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
    });
    document.body.appendChild(el);
  }

  clearTimeout(hideTimer);
  el.textContent = message;
  el.style.opacity = "1";
  el.style.transform = "translateX(-50%) translateY(0)";

  hideTimer = window.setTimeout(() => {
    if (el) {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(8px)";
    }
  }, 2000);
}
