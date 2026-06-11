import os from "node:os";
import { $, usePowerShell, type Options, type ProcessPromise } from "zx";
import { getSignal } from "./abort.ts";
import { getLogs } from "./logs/context.ts";

// zx defaults to bash, which isn't present on a stock Windows box.
// Use Windows PowerShell there so zx spawns and quotes for the right shell.
if (os.platform() === "win32") usePowerShell();

/**
 * zx-backed process primitive. Spawns a command exactly like zx's `$` and, when
 * run inside a pipeline (see `withLogs`), streams the child's stdout/stderr into
 * the ambient {@link LogsCollector} (stdout as `info`, stderr as `error`) under
 * the given `name`. As a core internal it sources the collector from async
 * context itself, so actions just describe the command. Returns zx's
 * `ProcessPromise`, so the caller can await it for the result.
 *
 * @param name Labels this process's log entries (their `source`).
 * @example
 * proc("build-docs", { cwd })`tskb ${pattern} --project ${name}`;
 */
export const proc = (name: string, opts?: Partial<Options>) => {
  // quiet: zx must not echo the child's output to our terminal — the collector
  // owns all output (otherwise every line prints twice: raw from zx, formatted
  // from the drain). Caller opts can still override.
  const $$ = $({ quiet: true, ...opts });

  return (pieces: TemplateStringsArray, ...args: unknown[]): ProcessPromise => {
    const child = $$(pieces, ...args);

    const logs = getLogs();
    if (logs) {
      logs.attach(child.stdout, name, "info");
      logs.attach(child.stderr, name, "error");
    }

    // Hook teardown: when the run's signal aborts, kill the child — but only if
    // it's still running. zx throws "Too late to kill" (on nextTick, uncatchably)
    // if the process already exited, which is routine now that an action's
    // completion drives teardown. So we track settlement and skip the kill.
    const signal = getSignal();
    if (signal) {
      let finished = false;
      const onAbort = (): void => {
        if (!finished) void child.kill();
      };
      const markFinished = (): void => {
        finished = true;
        signal.removeEventListener("abort", onAbort);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // Registered before the caller's own `.then`, so `finished` is set before
      // a completion handler can fire `cancel()` and abort us.
      void child.then(markFinished, markFinished);
    }

    return child;
  };
};
