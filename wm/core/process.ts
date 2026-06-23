import os from "node:os";
import { $, usePowerShell, type Options, type ProcessPromise } from "zx";
import type { Logger } from "./log-collector/LogsCollector.ts";
import { captureSnapshot } from "./output.ts";

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

      // Record the launch on the timeline as an event (the `event` level renders
      // `[ev]`), under the proc's own `source` so it's filterable by origin in
      // run.jsonl while still rendering as a milestone. The command zx resolved
      // rides inline for scanning; the structured args (cmd, cwd, …) are written
      // to a snapshot file and linked, exactly as the event bus does for a
      // non-string payload (see events.ts).
      //
      // `env` is dropped: passing it to zx means handing the whole environment
      // (you spread `...process.env` to add one var), so snapshotting it would
      // write 600+ entries — secrets and tokens included — to logs/ on every
      // launch. Everything else in opts is kept.
      const { env: _env, ...safeOpts } = opts ?? {};
      const snap = captureSnapshot(`proc-${name}-start`, { cmd: child.cmd, ...safeOpts });
      logs.append({
        source: name,
        level: "event",
        message: `${name} · start · ${child.cmd} · → ${snap.rel}`,
      });

      logs.attach(child.stdout, name, "info");
      logs.attach(child.stderr, name, "error");

      // Kill the child on teardown — but only if it's still running. zx throws
      // "Too late to kill" if the process already exited, which is routine now
      // that an action's completion drives teardown. So we track settlement and
      // skip the kill.
      let finished = false;
      const onAbort = (): void => {
        if (finished) return;
        // An abort listener must never throw: a throw here escapes the synchronous
        // `controller.abort()` dispatch as an uncaught exception (rethrown on
        // nextTick by the event target), killing the process before the run can
        // flush its log. zx's kill() throws *synchronously* when the child never
        // got a pid (an immediate spawn failure that raced ahead of this proc's
        // own `markFinished`), and can reject otherwise — neither matters during
        // teardown, so swallow both.
        try {
          void Promise.resolve(child.kill()).catch(() => {});
        } catch {
          // No pid — the child never started; nothing to kill.
        }
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
