/**
 * Plain, serializable projections the `core` layer builds from the tree and hands
 * to the writers. Kept here (output) as data-only shapes so the writers never
 * import `core`.
 */

export interface NodeView {
  readonly id: string;
  readonly uuid: string;
  readonly name: string;
  /** `file:line` where the action was defined (the `.run(...)` site); absent for the root. */
  readonly definedAt?: string;
  /** `file:line` of the call that launched this node; absent for the root. */
  readonly calledAt?: string;
  readonly path: string;
  readonly parentId: string | null;
  readonly tags: readonly string[];
  readonly args: readonly unknown[];
  readonly status: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly duration: number;
  /** Absolute path to this node's own `.log`. */
  readonly logFile: string;
  /** What the definition's `.describe()` said; absent when it said nothing. */
  readonly description?: { readonly summary: string };
  /** The definition's `.mcp()` exposure; absent when it is not exposed. */
  readonly mcp?: { readonly mode: string };
  /** The definition's `.args()` schema as JSON Schema; absent without one. */
  readonly inputSchema?: unknown;
  /** What the node returned, when JSON can carry it; absent for `undefined` and for failures. */
  readonly value?: unknown;
  /** Why a returned value is not in {@link value}: what it was, and that it was too big or not JSON. */
  readonly valueNote?: string;
  /** `"step"` for an inline `step(…)`; absent for an action launched from a definition. */
  readonly kind?: "step";
  readonly children: readonly NodeView[];
}

/** A curated artifact, as projected into `result.json`. Data-only — no core import. */
export interface ArtifactView {
  readonly name: string;
  /** Absolute path to the file. */
  readonly file: string;
  readonly description?: string;
  readonly mime: string;
}

export interface RunView {
  readonly ok: boolean;
  readonly failures: ReadonlyArray<{ action: string; error: string }>;
  readonly assertions: { readonly passed: number; readonly failed: number };
  readonly startedAt: number;
  readonly endedAt: number;
  readonly duration: number;
  /** Absolute path to `raw.jsonl`. */
  readonly rawStream: string;
  readonly root: NodeView;
  /** Files the run labelled via `ctx.artifact`, in registration order. */
  readonly artifacts: readonly ArtifactView[];
  /**
   * What the om body returned, when it returned something JSON can carry. Absent
   * otherwise — most bodies return nothing; an action host returns its action's result.
   */
  readonly value?: unknown;
}
