import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Carries the active run's {@link AbortSignal} through the async call tree, so
 * core internals (e.g. the {@link proc} primitive) can hook their teardown to it
 * without it being threaded through every signature — the same ambient pattern
 * as the logger. The pipeline owns one controller per run and aborts it on
 * teardown; everything long-running listens.
 */
const abortContext = new AsyncLocalStorage<AbortSignal>();

/** Runs `fn` with `signal` as the ambient abort signal for everything it awaits. */
export const withAbort = <T>(signal: AbortSignal, fn: () => T): T => abortContext.run(signal, fn);

/** The abort signal for the current run, or `undefined` outside one. */
export const getSignal = (): AbortSignal | undefined => abortContext.getStore();
