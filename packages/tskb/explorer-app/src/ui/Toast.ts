// ─── Toast ────────────────────────────────────────────────────────────────────
// Lightweight toast. Bottom-center, auto-dismisses. Supports info (default) and
// error variants. Used for copy confirmations and chunk-load failures.

type ToastVariant = "info" | "error";

const VARIANT_STYLE: Record<ToastVariant, { background: string; color: string; duration: number }> =
  {
    info: { background: "rgba(15,23,42,0.90)", color: "#f1f5f9", duration: 2000 },
    error: { background: "rgba(127,29,29,0.95)", color: "#fee2e2", duration: 4000 },
  };

let el: HTMLDivElement | null = null;
let hideTimer = 0;

export function showToast(message: string, variant: ToastVariant = "info"): void {
  if (!el) {
    el = document.createElement("div");
    el.id = "copy-toast";
    Object.assign(el.style, {
      position: "fixed",
      bottom: "24px",
      left: "50%",
      transform: "translateX(-50%) translateY(8px)",
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

  const style = VARIANT_STYLE[variant];
  clearTimeout(hideTimer);
  el.textContent = message;
  el.style.background = style.background;
  el.style.color = style.color;
  el.style.opacity = "1";
  el.style.transform = "translateX(-50%) translateY(0)";

  hideTimer = window.setTimeout(() => {
    if (el) {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(8px)";
    }
  }, style.duration);
}
