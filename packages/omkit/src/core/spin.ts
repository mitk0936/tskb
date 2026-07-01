import { action, type AnyActionInstance } from "./action.ts";
import { run, type Run, type RunOptions } from "./run.ts";

/**
 * Launch an action into the spin's run and get the same instance back, so you
 * can `await` its `.done` / `.ref` or subscribe with `.on` / `.once`. A nod is
 * how the body waves an action in.
 */
export type Nod = <I extends AnyActionInstance>(instance: I) => I;

/** Tunes a {@link spin} — the run's options plus how it drains. */
export interface SpinOptions extends RunOptions {
  /**
   * Stream the log to the console automatically from the start. Default `true`.
   * Set `false` when you need to drain later via {@link SpinContext.drain} —
   * e.g. after an interactive `prompt`, so the stream doesn't write over it.
   */
  drain?: boolean;
}

/** What a {@link spin} body receives. */
export interface SpinContext {
  /** Launch an action into the run; returns the instance for awaiting/chaining. */
  readonly nod: Nod;
  /**
   * Start streaming the run's log to the console now. Only needed when the spin
   * was created with `drain: false`; idempotent, so it's safe to call regardless.
   */
  readonly drain: Run["drain"];
  /**
   * Tear the run down (abort the signal, stopping daemons). Use it to end a run
   * whose work is finished but which is held open by a daemon — e.g. once a
   * one-shot build completes while a watcher is still running.
   */
  readonly cancel: Run["cancel"];
  /** The run's abort signal — honor it to stop early. */
  readonly signal: AbortSignal;
}

/** The body of a {@link spin}: any (async) function — it isn't named or wrapped by you. */
export type SpinBody = (ctx: SpinContext) => void | Promise<void>;

/**
 * Runs a linear orchestration. You pass a plain (async) function; tswm hosts it
 * in a single in-flight action and hands it a {@link Nod}. Because that host
 * stays in-flight while your body `await`s, the run never idles shut between
 * steps — so you write `await` / `if` control flow instead of nested `done`
 * callbacks. When the body returns, the daemons it nodded in keep the run alive
 * until teardown.
 *
 *   spin({ failFast: false }, async ({ nod }) => {
 *     if ((await nod(prompt({ … })).done) === "yes") await nod(test).done;
 *     nod(devServer);                                 // fire-and-forget daemon
 *     const chrome = nod(chromedriver({ … }));
 *     nod(chromePage(chrome.ref));                    // data deps via .ref
 *   });
 *
 * Auto-drains by default; pass `drain: false` and call `ctx.drain()` yourself to
 * stream the log only from a chosen point (e.g. after a `prompt`). Returns the
 * {@link Run}, so `.done` is available on it too.
 */
export function spin(body: SpinBody): Run;
export function spin(options: SpinOptions, body: SpinBody): Run;
export function spin(a: SpinOptions | SpinBody, b?: SpinBody): Run {
  const [options, body] = typeof a === "function" ? [{}, a] : [a, b as SpinBody];
  const { drain: autoDrain = true, ...runOptions } = options;

  // `run(...)` below assigns `host` synchronously, before the action's async body
  // ever runs — so the closures here capture the run safely.
  let host: Run;

  // One-shot drain: auto-drain and a manual ctx.drain() can't double-subscribe.
  let drained = false;
  const startDrain: Run["drain"] = (write) => {
    if (!drained) {
      drained = true;
      host.drain(write);
    }
    return host;
  };

  const hosted = action("Spin").run(async ({ signal }) => {
    const nod: Nod = (instance) => {
      host.run(instance);
      return instance;
    };
    await body({ nod, drain: startDrain, cancel: () => host.cancel(), signal });
  });

  host = run(runOptions, hosted());
  if (autoDrain) startDrain();
  return host;
}
