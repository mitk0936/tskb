import os from "node:os";
import { $, usePowerShell, type Options, type ProcessPromise } from "zx";
import type { Logger } from "./log-collector/LogsCollector.ts";

// zx defaults to bash, which isn't present on a stock Windows box.
// Use Windows PowerShell there so zx spawns and quotes for the right shell.
if (os.platform() === "win32") usePowerShell();

/**
 * Spawns a command (tagged-template, exactly like zx's `$`) and streams the
 * child's stdout/stderr into a log (stdout as `info`, stderr as `error`) under
 * the given `name`, killing the child when the bound signal aborts. Returns zx's
 * `ProcessPromise`, so the caller can await it for the result.
 *
 * @example
 * proc("build-docs", { cwd })`tskb ${pattern} --project ${name}`;
 */
export type Proc = (
  name: string,
  opts?: Partial<Options>
) => (pieces: TemplateStringsArray, ...args: unknown[]) => ProcessPromise;

/**
 * Builds a {@link Proc} bound to a specific log sink and abort signal. The action
 * pipeline injects one per action as `ctx.proc`, wired to that action's logger
 * and the run's signal — so actions just describe the command, with no ambient
 * lookup and nothing threaded through. A custom source (e.g. a CDP connection)
 * follows the same shape: take the action's `logs`/`signal`, push into the log,
 * and hook teardown.
 */
export const createProc =
  (logs: Logger, signal: AbortSignal): Proc =>
  (name, opts) => {
    // quiet: zx must not echo the child's output to our terminal — the collector
    // owns all output (otherwise every line prints twice: raw from zx, formatted
    // from the drain). Caller opts can still override.
    const $$ = $({ quiet: true, ...opts });

    return (pieces, ...args): ProcessPromise => {
      const child = $$(pieces, ...args);

      logs.attach(child.stdout, name, "info");
      logs.attach(child.stderr, name, "error");

      // Kill the child on teardown — but only if it's still running. zx throws
      // "Too late to kill" (on nextTick, uncatchably) if the process already
      // exited, which is routine now that an action's completion drives teardown.
      // So we track settlement and skip the kill.
      let finished = false;
      const onAbort = (): void => {
        if (!finished) void child.kill();
      };
      const markFinished = (): void => {
        finished = true;
        signal.removeEventListener("abort", onAbort);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      // Registered before the caller's own `.then`, so `finished` is set before a
      // completion handler can fire `cancel()` and abort us.
      void child.then(markFinished, markFinished);

      return child;
    };
  };
