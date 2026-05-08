import type { ExplorerNode } from "../types";

export type OnNodeRefClick = (nodeId: string) => void;
export type GetNodeFn = (nodeId: string) => ExplorerNode | undefined;
export type OnNodeHighlightFn = (nodeId: string | null) => void;
export type OnNodePrefetchFn = (nodeId: string) => Promise<void>;
export type GetRefsForFn = (nodeId: string, kind: "docs" | "flows") => ExplorerNode[];

/**
 * Lookups + callbacks every view needs. Built once by the host and injected
 * into the router so views never reach into the rest of the SPA.
 */
export interface RouterDeps {
  getNode: GetNodeFn;
  getRefsFor: GetRefsForFn;
  onNodeRef: OnNodeRefClick;
  onNodeHighlight: OnNodeHighlightFn;
  onNodePrefetch: OnNodePrefetchFn;
}

/** What the host gives a View when asking it to render. */
export interface ViewContext {
  canGoBack: boolean;
  back(): void;
  close(): void;
}

/**
 * A single panel state. Each subclass declares a route prefix + parser so the
 * router can rebuild the view from a hash fragment on browser back/forward.
 */
export interface View {
  /** Hash fragment after the leading `#/` — e.g. `refs/<nodeId>/docs`. */
  route(): string;
  renderHeader(headerEl: HTMLElement, ctx: ViewContext): void;
  renderBody(bodyEl: HTMLElement): void;
  /** Optional cleanup called when the view leaves the stack. */
  onLeave?(): void;
}

/**
 * Static side of a View class — used by the router to register routes and
 * rebuild views from a hash fragment.
 */
export interface ViewCtor {
  readonly prefix: string;
  parse(rest: string, deps: RouterDeps): View | null;
}
