import "./doc-panel.css";
import { createHeaderButton } from "./HeaderActions";
import type { Router, View } from "../router";

/**
 * Thin host shell for the panel. Owns the slide-in chrome (`#doc-panel`,
 * header, body, close button) and subscribes to the {@link Router} so that
 * whenever the active view changes, it clears the slots and asks the view
 * to render into them. Views are responsible for their own interaction wiring.
 */
export class DocPanel {
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly backSlot: HTMLElement;
  private readonly backButton: HTMLButtonElement;
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly router: Router) {
    this.panel = document.getElementById("doc-panel")!;
    this.title = document.getElementById("doc-panel-title")!;
    this.body = document.getElementById("doc-panel-body")!;
    this.backSlot = document.getElementById("doc-panel-back")!;

    this.backButton = createHeaderButton("back", {
      title: "Back",
      onClick: () => this.router.back(),
    });
    this.backSlot.appendChild(this.backButton);
    this.backSlot.hidden = true;

    const actions = document.getElementById("doc-panel-actions")!;
    actions.appendChild(
      createHeaderButton("close", { title: "Close", onClick: () => this.router.close() })
    );

    this.unsubscribe = this.router.subscribe((view, canGoBack) => {
      this.onViewChange(view, canGoBack);
    });
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  get isOpen(): boolean {
    return this.panel.classList.contains("open");
  }

  private onViewChange(view: View | null, canGoBack: boolean): void {
    if (!view) {
      this.panel.classList.remove("open");
      this.backSlot.hidden = true;
      return;
    }
    this.resetTitle();
    this.body.innerHTML = "";

    const ctx = this.router.context();
    view.renderHeader(this.title, ctx);
    view.renderBody(this.body);

    this.backSlot.hidden = !canGoBack;
    this.panel.classList.add("open");
  }

  private resetTitle(): void {
    this.title.innerHTML = "";
    this.title.removeAttribute("data-refs");
    // Strip any other data-* attributes a previous view may have set.
    for (const attr of Array.from(this.title.attributes)) {
      if (attr.name.startsWith("data-")) this.title.removeAttribute(attr.name);
    }
  }
}
