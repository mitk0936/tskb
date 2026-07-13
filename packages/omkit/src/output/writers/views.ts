/**
 * Plain, serializable projections the `core` layer builds from the tree and hands
 * to the writers. Kept here (output) as data-only shapes so the writers never
 * import `core`.
 */

export interface NodeView {
  readonly id: string;
  readonly uuid: string;
  readonly name: string;
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
  readonly children: readonly NodeView[];
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
}
