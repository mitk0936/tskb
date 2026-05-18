/** What the host gives a View when asking it to render. */
export interface ViewContext {
  canGoBack: boolean;
  back(): void;
  close(): void;
}

/**
 * A single panel state. Instantiated per navigation with its own deps and
 * route state — immutable after construction.
 */
export interface View {
  /** Hash fragment after the leading `#/` — e.g. `refs/<nodeId>/docs`. */
  readonly route: string;
  renderHeader(headerEl: HTMLElement, ctx: ViewContext): void;
  renderBody(bodyEl: HTMLElement): void;
  /** Optional cleanup called when the view leaves the stack. */
  onLeave?(): void;
}
