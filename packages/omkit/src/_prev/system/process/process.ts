import { execFileSync } from "node:child_process";
import os from "node:os";
import { $, kill, usePowerShell, type Options, type ProcessPromise } from "zx";
import type { Logger } from "../../output/log/LogsCollector.ts";
import type { SnapshotStore } from "../../output/snapshot/SnapshotStore.ts";

// zx defaults to bash, which isn't present on a stock Windows box.
// Use Windows PowerShell there so zx spawns and quotes for the right shell.
if (os.platform() === "win32") usePowerShell();

/**
 * Force-kill a process **and its whole tree, synchronously**.
 *
 * Windows has no process groups: a child outlives its parent, and a Ctrl-C sent
 * to the console group can make an intermediate shell exit and *orphan* the real
 * app (e.g. electron.exe), which then survives teardown. So the tree must be
 * reaped explicitly by PID — `taskkill /F /T` does it, and running it
 * **synchronously** guarantees it completes before the run's own process exits
 * (a fire-and-forget kill can lose that race). On POSIX, zx's `kill` already
 * does a process-group tree kill. Best-effort: an already-dead/missing PID is
 * ignored.
 */
export const killTree = (pid: number): void => {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } catch {
      // already gone, access denied, or taskkill missing — nothing more to do
    }
  } else {
    void kill(pid).catch(() => {});
  }
};

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
 * Builds a {@link Proc} bound to a specific log sink, abort signal, and the run's
 * snapshot store. The action pipeline injects one per action as `ctx.proc`, wired
 * to that action's logger, the run's signal, and the run's `output.snapshots` — so
 * actions just describe the command, with no ambient lookup and nothing threaded
 * through. A custom source (e.g. a CDP connection) follows the same shape: take the
 * action's `logs`/`signal`, push into the log, and hook teardown.
 */
export const createProc =
  (logs: Logger, signal: AbortSignal, snapshots: SnapshotStore): Proc =>
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
      // Resolve where the child actually runs. zx only records cwd on its child
      // when one was passed; left unset it falls back to process.cwd() at spawn,
      // so mirror that here to always log a concrete directory (the `...safeOpts`
      // spread sits before `cwd` so this resolved value wins even when opts omits
      // it). This is the "where" that makes a launch line reproducible.
      const cwd = opts?.cwd ?? process.cwd();
      const snap = snapshots.captureJson(`proc-${name}-start`, {
        cmd: child.cmd,
        ...safeOpts,
        cwd,
      });
      logs.append({
        source: name,
        level: "event",
        message: `${name} · start · ${child.cmd} · in ${cwd} · → ${snap.rel}`,
      });

      logs.attach(child.stdout, name, "info");
      logs.attach(child.stderr, name, "error");

      // Kill the child's entire process tree on teardown via {@link killTree} —
      // a synchronous, force tree kill by PID (taskkill /F /T on Windows,
      // process-group kill on Unix). Synchronous so it finishes before the run's
      // process exits. NOTE: with zx the direct child is a *shell wrapper*
      // (PowerShell on Windows), so this only reaps grandchildren while that
      // wrapper is still alive; a GUI app that must survive its shell being
      // Ctrl-C'd should be launched shell-less via `command(name, file, args)`,
      // whose direct child is the app itself.
      let finished = false;
      const onAbort = (): void => {
        if (finished) return;
        const pid = child.pid;
        if (pid != null) killTree(pid);
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
