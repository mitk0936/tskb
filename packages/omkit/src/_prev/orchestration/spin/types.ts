// `Nod` is defined with the action types (it's action-centric) and re-exported here
// so `spin`'s public surface (SpinContext, the `omkit` barrel) keeps exposing it.
export type { Nod } from "../action/types.ts";
import type { Nod } from "../action/types.ts";
import type { Assert } from "../../output/log/assert.ts";

/** What a {@link spin} body receives. */
export interface SpinContext {
  /** Launch an action into the spin; returns the instance for awaiting/chaining. */
  readonly nod: Nod;
  /**
   * Tear the spin down (abort the signal, stopping daemons). Use it to end a spin
   * whose work is finished but which is held open by a daemon — e.g. once a
   * one-shot build completes while a watcher is still running.
   */
  readonly cancel: () => void;
  /** The spin's abort signal — honor it to stop early. */
  // TODO: not pass it on spin, but on actions
  readonly signal: AbortSignal;
  /**
   * Absolute path to this spin's output folder (`logs/<name>/<date>/<time>/`),
   * created up front. Hand it to actions (or use `ctx.artifactsFolder` inside
   * one) to write artifacts beside `run.log`.
   */
  // TODO: is it passed in actions???
  readonly artifactsFolder: string;
  /**
   * Capture a JSON snapshot into this run's output folder and drop a `[snapshot]`
   * line on the timeline — for run-level inputs the log should narrate (a build
   * config, resolved options). Resolves with the snapshot's relative path. The
   * run-scoped counterpart to the action `ctx.output.snapshots`.
   */
  readonly snapshot: (name: string, value: unknown) => Promise<string>;
  /**
   * Assert a boolean invariant from the spin body. Same semantics as the action
   * `ctx.assert`; body assertions are attributed to the host action path
   * (`omkit:Spin`).
   */
  readonly assert: Assert;
}

/** The body of a {@link spin}: any (async) function — it isn't named or wrapped by you. */
export type SpinBody = (ctx: SpinContext) => void | Promise<void>;

/**
 * A single action's failure, captured for the spin's verdict. Cascade failures —
 * actions that settled `{ ok: false }` only because teardown aborted them — are
 * deliberately excluded (see `launch`'s outcome handling), so this records
 * genuine faults, not fallout.
 */
export interface ActionFailure {
  /** The failing action's name. */
  readonly action: string;
  /** Whatever it failed with (the Outcome's `error`). */
  readonly error: unknown;
}

/**
 * The terminal verdict of a spin: did everything that mattered succeed, and if
 * not, what failed. {@link SpinHost.done} resolves (never rejects) with this, so a
 * single `await` yields the outcome instead of forcing a try/catch on awaiters.
 * A failing action is *recorded* here (so `ok` is false and the exit code is 1)
 * but does **not** tear the spin down — see {@link SpinHost}.
 */
export interface SpinResult {
  /** True when no genuine failure was recorded. */
  readonly ok: boolean;
  /** The genuine failures, in the order they surfaced. Empty when `ok`. */
  readonly failures: readonly ActionFailure[];
}

export type SpinState = "open" | "closing" | "closed";
