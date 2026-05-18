import type { View, ViewContext } from "./types";

type Listener = (view: View | null, canGoBack: boolean) => void;

/**
 * Panel router. Owns a stack of View instances and (optionally) syncs the top
 * to `location.hash`. Views are constructed by callers and pushed directly;
 * view factories (registered via registerView) are used only for hash restoration.
 *
 * Stack semantics:
 *   push(view)      → append + notify + write hash
 *   replace(view)   → swap top + notify + write hash
 *   back()          → pop + notify + write hash
 *   close()         → clear stack + notify + clear hash
 *
 * Hash sync is opt-in via init({ syncHash: true }).
 */
export class Router {
  private stack: View[] = [];
  private listeners = new Set<Listener>();
  private viewFactories = new Map<string, (rest: string) => View | null>();
  private syncHash = false;
  private writingHash = false;

  /**
   * Registers a factory for hash restoration. Deps are bound at registration
   * time so the router never needs to know about them.
   */
  registerView<D>(
    viewClass: { prefix: string; parse(rest: string, deps: D): View | null },
    deps: D
  ): void {
    this.viewFactories.set(viewClass.prefix, (rest) => viewClass.parse(rest, deps));
  }

  init(options: { syncHash?: boolean } = {}): void {
    this.syncHash = options.syncHash ?? false;
    if (this.syncHash) {
      window.addEventListener("hashchange", this.onHashChange);
      this.restoreFromHash();
    }
  }

  /**
   * Re-renders the active view without changing the stack. Call after the
   * graph store loads new chunks so a hash-restored view refreshes with real data.
   */
  refresh(): void {
    this.notify();
  }

  push(view: View): void {
    const top = this.active();
    if (top && top.route === view.route) return;
    this.stack.push(view);
    this.notify();
    this.writeHash();
  }

  replace(view: View): void {
    const top = this.stack.pop();
    top?.onLeave?.();
    this.stack.push(view);
    this.notify();
    this.writeHash();
  }

  back(): void {
    if (this.stack.length === 0) return;
    const top = this.stack.pop();
    top?.onLeave?.();
    this.notify();
    this.writeHash();
  }

  close(): void {
    while (this.stack.length > 0) {
      this.stack.pop()?.onLeave?.();
    }
    this.notify();
    this.writeHash();
  }

  active(): View | null {
    return this.stack[this.stack.length - 1] ?? null;
  }

  canGoBack(): boolean {
    return this.stack.length > 1;
  }

  context(): ViewContext {
    return {
      canGoBack: this.canGoBack(),
      back: () => this.back(),
      close: () => this.close(),
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const top = this.active();
    const canBack = this.canGoBack();
    for (const l of this.listeners) l(top, canBack);
  }

  // ── Hash sync ──────────────────────────────────────────────────────────────

  private writeHash(): void {
    if (!this.syncHash) return;
    const top = this.active();
    const target = top ? `#/${top.route}` : "";
    const current = window.location.hash;
    if (current === target || (!target && current === "")) return;
    this.writingHash = true;
    try {
      if (target) {
        window.location.hash = target.slice(1); // strip leading '#'
      } else {
        window.history.pushState(null, "", window.location.pathname + window.location.search);
      }
    } finally {
      // hashchange fires async; clear flag on next tick
      setTimeout(() => {
        this.writingHash = false;
      }, 0);
    }
  }

  private onHashChange = (): void => {
    if (this.writingHash) return;
    this.restoreFromHash();
  };

  private restoreFromHash(): void {
    const raw = window.location.hash.replace(/^#\/?/, "");
    if (!raw) {
      while (this.stack.length > 0) this.stack.pop()?.onLeave?.();
      this.notify();
      return;
    }
    const view = this.parseRoute(raw);
    if (!view) return; // unknown or malformed route — leave current state alone
    while (this.stack.length > 0) this.stack.pop()?.onLeave?.();
    this.stack.push(view);
    this.notify();
  }

  private parseRoute(route: string): View | null {
    const slash = route.indexOf("/");
    const prefix = slash < 0 ? route : route.slice(0, slash);
    const rest = slash < 0 ? "" : route.slice(slash + 1);
    const factory = this.viewFactories.get(prefix);
    if (!factory) return null;
    return factory(rest);
  }
}

/**
 * Default panel router instance. Inject this into views/components that need
 * a router rather than importing it directly so call sites stay testable.
 */
export const panelRouter = new Router();
