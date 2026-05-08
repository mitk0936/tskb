import type { RouterDeps, View, ViewContext, ViewCtor } from "./types";

type Listener = (view: View | null, canGoBack: boolean) => void;

/**
 * Panel router. Owns a stack of views and (optionally) syncs the top of the
 * stack to `location.hash`. The host (DocPanel) subscribes for render
 * notifications; views are constructed by callers and via registered ViewCtors
 * for hash-restoration.
 *
 * Stack semantics:
 *   push(view)      → append + notify + write hash
 *   replace(view)   → swap top + notify + write hash
 *   back()          → pop + notify + write hash (no-op if stack empty)
 *   close()         → clear stack + notify + clear hash
 *
 * Hash sync is opt-in via init({ syncHash: true }). When the user navigates
 * back/forward, the stack is rebuilt from the new hash (single-entry stack —
 * we don't try to reconstruct deep history from the URL).
 */
export class Router {
  private stack: View[] = [];
  private listeners = new Set<Listener>();
  private viewCtors = new Map<string, ViewCtor>();
  private deps: RouterDeps | null = null;
  private syncHash = false;
  private writingHash = false;

  registerView(ctor: ViewCtor): void {
    this.viewCtors.set(ctor.prefix, ctor);
  }

  init(deps: RouterDeps, options: { syncHash?: boolean } = {}): void {
    this.deps = deps;
    this.syncHash = options.syncHash ?? false;
    if (this.syncHash) {
      window.addEventListener("hashchange", this.onHashChange);
      this.restoreFromHash();
    }
  }

  /**
   * Re-renders the active view without changing the stack. Call this after the
   * graph store loads new chunks so a hash-restored view (which may have shown
   * placeholder data on first paint) refreshes with real data.
   */
  refresh(): void {
    this.notify();
  }

  /**
   * Exposes the wired deps so the host can pass them to shared helpers like
   * `wireRefs()` after a view renders. Throws if init() hasn't run yet.
   */
  getDepsForHost(): RouterDeps {
    if (!this.deps) throw new Error("Router.getDepsForHost() called before init()");
    return this.deps;
  }

  push(view: View): void {
    // Skip identical-route pushes (e.g. clicking the same chip twice) so the
    // back stack stays meaningful and the URL doesn't accumulate dupes.
    const top = this.active();
    if (top && top.route() === view.route()) return;
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
    const target = top ? `#/${top.route()}` : "";
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
    if (!this.deps) return;
    const raw = window.location.hash.replace(/^#\/?/, "");
    if (!raw) {
      // External navigation cleared the hash — empty the stack
      while (this.stack.length > 0) this.stack.pop()?.onLeave?.();
      this.notify();
      return;
    }
    const view = this.parseRoute(raw);
    if (!view) return; // unknown route — leave current state alone
    while (this.stack.length > 0) this.stack.pop()?.onLeave?.();
    this.stack.push(view);
    this.notify();
  }

  private parseRoute(route: string): View | null {
    if (!this.deps) return null;
    const slash = route.indexOf("/");
    const prefix = slash < 0 ? route : route.slice(0, slash);
    const rest = slash < 0 ? "" : route.slice(slash + 1);
    const ctor = this.viewCtors.get(prefix);
    if (!ctor) return null;
    return ctor.parse(rest, this.deps);
  }
}

/**
 * Default panel router instance. Inject this into views/components that need
 * a router rather than importing it directly so call sites stay testable.
 */
export const panelRouter = new Router();
