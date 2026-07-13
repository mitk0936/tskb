/**
 * The identity carried wherever an action is pointed to — a log file's header, a
 * rollup chunk header, a log-file reference. A plain data shape (no behavior) so
 * both the `output` and `core` layers can use it without depending on each other.
 * Rendered compactly as `name · path · [tags]`.
 */
export interface ActionRef {
  /** `${name}_${shortId}`, or `main` for the root. */
  readonly id: string;
  /** The action's declared name. */
  readonly name: string;
  /** Ancestry of ids joined by `/` — `main/chromePage_9f3c/debug_77d1`. */
  readonly path: string;
  /** Accumulated tags at the point of reference. */
  readonly tags: readonly string[];
}

/** Render an {@link ActionRef} for a header/reference line: `name · path · [a, b]`. */
export const renderRef = (ref: ActionRef): string => {
  const tags = ref.tags.length ? ` · [${ref.tags.join(", ")}]` : "";
  return `${ref.name} · ${ref.path}${tags}`;
};
