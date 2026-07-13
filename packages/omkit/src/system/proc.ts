import { execFileSync } from "node:child_process";
import os from "node:os";
import { $, usePowerShell, type Options, type ProcessPromise } from "zx";

// zx defaults to bash, absent on a stock Windows box — use PowerShell there.
if (os.platform() === "win32") usePowerShell();

/**
 * Force-kill a process **and its whole tree, synchronously**. On POSIX zx's
 * process-group kill does it. On Windows there are no process groups, and
 * `taskkill /F /T` walks the *live* tree — so a grandchild whose intermediate
 * (npm, npx, a launcher) has already exited gets re-parented and slips the net,
 * leaving orphaned servers (chromedriver, tsc --watch, vite). Instead we snapshot
 * every process once, walk all descendants of `pid` from that snapshot, and kill
 * each by explicit PID — immune to re-parenting during the sweep. Best-effort.
 */
export const killTree = (pid: number): void => {
  if (process.platform === "win32") {
    const script = [
      `$root=${pid}`,
      `$all=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId`,
      `$seen=New-Object System.Collections.Generic.HashSet[int]`,
      `$q=New-Object System.Collections.Generic.Queue[int]`,
      `[void]$q.Enqueue($root)`,
      `while($q.Count){$p=$q.Dequeue();if($seen.Add($p)){foreach($c in $all){if($c.ParentProcessId -eq $p){[void]$q.Enqueue([int]$c.ProcessId)}}}}`,
      `foreach($id in $seen){try{Stop-Process -Id $id -Force -ErrorAction SilentlyContinue}catch{}}`,
    ].join(";");
    try {
      execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
        stdio: "ignore",
      });
    } catch {
      // access denied / already gone — nothing more to do
    }
  } else {
    // POSIX: the child is spawned as its own process-group leader (see createProc),
    // so `-pid` targets the whole group — every descendant, re-parented or not.
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
};

/**
 * `process.env` with any inherited debugger auto-attach stripped. A pipeline's
 * children (npm, vite, tsc, chromedriver) should run as themselves, not attach to
 * the orchestrator's inspector: under VSCode's JS Debug Terminal that injection
 * makes every child print "Debugger attached." and, at teardown, linger on
 * "Waiting for the debugger to disconnect..." — holding ports (e.g. the explorer's
 * 9876) long enough to collide with the next run's bind. We drop the auto-attach
 * signal (`VSCODE_INSPECTOR_OPTIONS`) and any `--inspect*` flags from `NODE_OPTIONS`.
 *
 * Opt back in to debug a child: per-proc via `{ inheritDebugger: true }`, or for a
 * whole run via the `OMKIT_INHERIT_DEBUGGER` env var. (Debugging the orchestrator
 * itself always works — this only governs what spawned children inherit.)
 */
const debuggerFreeEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env };
  delete env.VSCODE_INSPECTOR_OPTIONS;
  if (env.NODE_OPTIONS) {
    const kept = env.NODE_OPTIONS.split(/\s+/).filter(
      (tok) => !/^--inspect(-brk|-port|-publish-uid)?(=|$)/.test(tok)
    );
    const joined = kept.join(" ").trim();
    if (joined) env.NODE_OPTIONS = joined;
    else delete env.NODE_OPTIONS;
  }
  return env;
};

/** Where a proc writes its lines — bound by the framework to the owning node's log. */
export type ProcSink = (source: string, level: string, message: string) => void;

/** zx spawn options plus omkit's own knobs. */
export type ProcOptions = Partial<Options> & {
  /**
   * Let this child inherit the orchestrator's debugger instead of running clean
   * (default false). Also enabled for every child by the `OMKIT_INHERIT_DEBUGGER`
   * env var. See {@link debuggerFreeEnv}.
   */
  inheritDebugger?: boolean;
};

/** Spawn a shell command (zx tagged-template), streaming its output into the log. */
export type Proc = (
  name: string,
  opts?: ProcOptions
) => (pieces: TemplateStringsArray, ...args: unknown[]) => ProcessPromise;

/**
 * Build a {@link Proc} bound to a log sink and abort signal. The framework injects
 * one per action as `ctx.proc`, wired to that action's log and the run's signal, so
 * actions just describe the command — output streams in, the child dies on teardown.
 */
export const createProc =
  (sink: ProcSink, signal: AbortSignal): Proc =>
  (name, opts) => {
    const { inheritDebugger, ...zxOpts } = opts ?? {};
    // quiet: the log owns all output; zx must not also echo to the terminal.
    // detached (POSIX only): give the child its own process group so `killTree`
    // can reap the *whole* group atomically with `kill(-pid)`, even when an
    // intermediate has exited and re-parented its children. (On Windows detached
    // spawns a new console; we reap via a PID-tree sweep instead — see killTree.)
    // env: children run clean of the orchestrator's debugger unless opted in (see
    // debuggerFreeEnv) — a caller's explicit `env` still wins via `...zxOpts`.
    const keepDebugger = inheritDebugger || Boolean(process.env.OMKIT_INHERIT_DEBUGGER);
    const $$ = $({
      quiet: true,
      detached: process.platform !== "win32",
      env: keepDebugger ? { ...process.env } : debuggerFreeEnv(),
      ...zxOpts,
    });
    return (pieces, ...args): ProcessPromise => {
      const child = $$(pieces, ...args);
      const cwd = opts?.cwd ?? process.cwd();
      sink(name, "event", `${name} · start · ${child.cmd} · in ${cwd}`);
      void streamLines(child.stdout, (line) => sink(name, "info", line));
      void streamLines(child.stderr, (line) => sink(name, "error", line));

      // Kill the child's tree on teardown; unhook once it settles on its own.
      let finished = false;
      const onAbort = (): void => {
        if (!finished && typeof child.pid === "number") killTree(child.pid);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      const done = (): void => {
        finished = true;
        signal.removeEventListener("abort", onAbort);
      };
      void child.then(done, done);
      return child;
    };
  };

/** Split a byte/string stream into lines, calling `onLine` for each non-empty one. */
async function streamLines(
  stream: AsyncIterable<unknown>,
  onLine: (line: string) => void
): Promise<void> {
  let buffer = "";
  for await (const chunk of stream) {
    buffer += String(chunk);
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).replace(/\r$/, "");
      buffer = buffer.slice(nl + 1);
      if (line) onLine(line);
    }
  }
  const tail = buffer.replace(/\r$/, "");
  if (tail) onLine(tail);
}
