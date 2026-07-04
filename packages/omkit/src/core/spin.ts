import { action, type AnyActionInstance } from "./action.ts";
import { run, type Spin } from "./run.ts";
import { artifactsFolder } from "./output.ts";

/**
 * Launch an action into the spin and get the same instance back, so you can
 * `await` its `.done` (its {@link import("./action.ts").Outcome} — resolves with
 * `{ ok, value } | { ok, error }`, **never throws**), its `.ref` (the attached
 * handle; rejects on failure, so it's for data deps consumed inside other
 * actions), or subscribe with `.on` / `.once`. A nod is how the body waves an
 * action in.
 */
export type Nod = <I extends AnyActionInstance>(instance: I) => I;

/** Tunes a {@link spin} — currently just how it drains. */
export interface SpinOptions {
  /**
   * Stream the log to the console automatically from the start. Default `true`.
   * Set `false` when you need to drain later via {@link SpinContext.drain} —
   * e.g. after an interactive `prompt`, so the stream doesn't write over it.
   */
  drain?: boolean;
}

/** What a {@link spin} body receives. */
export interface SpinContext {
  /** Launch an action into the spin; returns the instance for awaiting/chaining. */
  readonly nod: Nod;
  /**
   * Start streaming the spin's log to the console now. Only needed when the spin
   * was created with `drain: false`; idempotent, so it's safe to call regardless.
   */
  readonly drain: Spin["drain"];
  /**
   * Tear the spin down (abort the signal, stopping daemons). Use it to end a spin
   * whose work is finished but which is held open by a daemon — e.g. once a
   * one-shot build completes while a watcher is still running.
   */
  readonly cancel: Spin["cancel"];
  /** The spin's abort signal — honor it to stop early. */
  readonly signal: AbortSignal;
  /**
   * Absolute path to this spin's output folder (`logs/<name>/<date>/<time>/`),
   * created up front. Hand it to actions (or use `ctx.artifactsFolder` inside
   * one) to write artifacts beside `run.log`.
   */
  readonly artifactsFolder: string;
}

/** The body of a {@link spin}: any (async) function — it isn't named or wrapped by you. */
export type SpinBody = (ctx: SpinContext) => void | Promise<void>;

/**
 * Runs a linear orchestration. You pass a plain (async) function; omkit hosts it
 * in a single in-flight action and hands it a {@link Nod}. Because that host
 * stays in-flight while your body `await`s, the spin never idles shut between
 * steps — so you write `await` / `if` control flow instead of nested callbacks.
 * When the body returns, the daemons it nodded in keep the spin alive until
 * teardown.
 *
 * A failing action **never throws into the body** — `await nod(x).done` yields an
 * {@link import("./action.ts").Outcome} you inspect, and the spin keeps going
 * (the failure is recorded in the verdict and sets exit code 1):
 *
 *   spin({ drain: false }, async ({ nod }) => {
 *     const ans = await nod(prompt({ … })).done;       // Outcome — never throws
 *     if (ans.ok && ans.value === "yes") await nod(test).done;
 *     nod(devServer);                                   // fire-and-forget daemon
 *     const chrome = nod(chromedriver({ … }));
 *     nod(chromePage(chrome.ref));                      // data deps via .ref
 *   });
 *
 * Auto-drains by default; pass `drain: false` and call `ctx.drain()` yourself to
 * stream the log only from a chosen point (e.g. after a `prompt`). Returns the
 * {@link Spin} — `await` its `.done` for the verdict.
 */
export function spin(body: SpinBody): Spin;
export function spin(options: SpinOptions, body: SpinBody): Spin;
export function spin(a: SpinOptions | SpinBody, b?: SpinBody): Spin {
  const [options, body] = typeof a === "function" ? [{}, a] : [a, b as SpinBody];
  const { drain: autoDrain = true } = options;

  // `run(...)` below assigns `host` synchronously, before the action's async body
  // ever runs — so the closures here capture the spin safely.
  let host: Spin;

  // One-shot drain: auto-drain and a manual ctx.drain() can't double-subscribe.
  let drained = false;
  const startDrain: Spin["drain"] = (write) => {
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
    await body({
      nod,
      drain: startDrain,
      cancel: () => host.cancel(),
      signal,
      artifactsFolder: artifactsFolder(),
    });
  });

  const hostInstance = hosted();
  host = run(hostInstance);
  // The body is the orchestrator, not a peer action: if it throws, tear the whole
  // spin down. Regular action failures only get recorded (they don't stop the
  // spin), but the orchestrator crashing must end the run — otherwise any daemon
  // it already nodded keeps the process alive forever on a pipeline bug.
  void hostInstance.done.then((outcome) => {
    if (!outcome.ok) host.cancel();
  });
  if (autoDrain) startDrain();
  return host;
}
