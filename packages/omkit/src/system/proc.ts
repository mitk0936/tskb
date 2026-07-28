import { execFileSync } from "node:child_process";
import os from "node:os";
import { $, usePowerShell, type Options, type ProcessPromise } from "zx";
import { ProcRegistry, winSnapshot } from "./procRegistry.ts";

// zx defaults to bash, absent on a stock Windows box — use PowerShell there.
if (os.platform() === "win32") usePowerShell();

/**
 * Force-kill a process **and its whole tree, synchronously**.
 *
 * On POSIX the child is spawned as its own process-group leader (see createProc), so
 * `kill(-pid)` reaps the whole group in one call — every descendant, re-parented or not.
 *
 * On Windows there are no process groups and we can't detach (a console-less child breaks
 * npm/vite — see createProc), so a mashed Ctrl+C sent to the shared console can make an
 * intermediate shell (powershell/npm/npx) exit and orphan its real leaf (vite,
 * chromedriver.exe) before teardown reaps it. `taskkill /F /T` force-kills the live tree
 * by PID, but a leaf whose intermediate already exited can't be reached via `/T` — that
 * mash-Ctrl+C orphan is a known Windows edge, mitigated by a port/PID sweep on teardown
 * rather than by detaching. Best-effort: an already-dead PID is ignored.
 */
export const killTree = (pid: number): void => {
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } catch {
      // already gone, access denied, or taskkill missing — nothing more to do
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
};

// A single --inspect* flag in NODE_OPTIONS, matched only when it stands alone (so it
// never eats a prefix like `--inspector-foo`): --inspect / --inspect-brk / --inspect-port
// / --inspect-publish-uid, each with an optional `=value`.
const INSPECT_FLAG = /--inspect(?:-brk|-port|-publish-uid)?(?:=\S+)?(?=\s|$)/g;
// `--require <arg>` whose arg points at VS Code's js-debug auto-attach bootloader.
const VSCODE_BOOTLOADER_REQUIRE = /--require\s+("[^"]*"|\S+)/g;

/**
 * A copy of `env` with the orchestrator's debugger stripped, so a spawned child runs
 * clean instead of inheriting our inspector. Removes `--inspect*` flags from
 * `NODE_OPTIONS`, drops VS Code auto-attach's injected bootloader `--require` and its
 * `VSCODE_INSPECTOR_OPTIONS` handshake, and deletes `NODE_OPTIONS` entirely if nothing
 * else remains. A legitimate non-debug `--require` and any other options are preserved.
 * Does not mutate the input.
 */
export const debuggerFreeEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const clean: NodeJS.ProcessEnv = { ...env };
  delete clean.VSCODE_INSPECTOR_OPTIONS;
  const nodeOptions = clean.NODE_OPTIONS;
  if (nodeOptions !== undefined) {
    const stripped = nodeOptions
      .replace(VSCODE_BOOTLOADER_REQUIRE, (whole, arg: string) =>
        /js-debug|bootloader/i.test(arg) ? "" : whole
      )
      .replace(INSPECT_FLAG, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped) clean.NODE_OPTIONS = stripped;
    else delete clean.NODE_OPTIONS;
  }
  return clean;
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
 * The run-wide orphan reaper. `createProc` registers each shell it spawns (Windows only);
 * the ExecutionTree calls `procRegistry.sweep()` at teardown to reap any that a mashed
 * Ctrl+C orphaned. A no-op in practice off Windows (nothing is tracked there).
 */
export const procRegistry = new ProcRegistry(winSnapshot, killTree);

/**
 * Build a {@link Proc} bound to a log sink and abort signal. The framework injects
 * one per action as `ctx.proc`, wired to that action's log and the run's signal, so
 * actions just describe the command — output streams in, the child dies on teardown.
 */
export const createProc =
  (sink: ProcSink, signal: AbortSignal): Proc =>
  (name, opts) => {
    const { inheritDebugger, ...zxOpts } = opts ?? {};
    // Children run debugger-free by default: our inspector (a VS Code auto-attach
    // NODE_OPTIONS, or a plain --inspect) would otherwise be inherited by every child,
    // spamming "Debugger attached", stalling teardown on "waiting for the debugger to
    // disconnect" (so ports stay held into the next run), and hiding the real error.
    // Opt in per-proc with `inheritDebugger`, or globally with OMKIT_INHERIT_DEBUGGER.
    const inherit = inheritDebugger ?? Boolean(process.env.OMKIT_INHERIT_DEBUGGER);
    const baseEnv = (zxOpts.env as NodeJS.ProcessEnv | undefined) ?? process.env;
    // quiet: the log owns all output; zx must not also echo to the terminal.
    // detached (POSIX only): give the child its own process group so `killTree` can reap
    // the whole group atomically with `kill(-pid)`. On POSIX this also isolates it from the
    // terminal's Ctrl+C (only the foreground group is signalled). We do NOT detach on
    // Windows: there `detached` means DETACHED_PROCESS (no console), and console commands
    // like npm/vite then exit immediately with no output — so the Windows Ctrl+C-orphan
    // edge is handled another way, not by detaching.
    const $$ = $({
      quiet: true,
      detached: process.platform !== "win32",
      ...zxOpts,
      env: (inherit ? { ...baseEnv } : debuggerFreeEnv(baseEnv)) as Options["env"],
    });
    return (pieces, ...args): ProcessPromise => {
      const child = $$(pieces, ...args);
      const cwd = opts?.cwd ?? process.cwd();
      sink(name, "event", `${name} · start · ${child.cmd} · in ${cwd}`);
      void streamLines(child.stdout, (line) => sink(name, "info", line));
      void streamLines(child.stderr, (line) => sink(name, "error", line));

      // On Windows (where we can't detach) track this shell's pid, so the run's teardown
      // sweep can reap a grandchild orphaned by a mashed Ctrl+C — see procRegistry.
      if (process.platform === "win32" && typeof child.pid === "number") {
        procRegistry.track(child.pid);
      }

      // Kill the child's tree on teardown; unhook once it settles on its own.
      let finished = false;
      const onAbort = (): void => {
        if (!finished && typeof child.pid === "number") killTree(child.pid);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      const done = (): void => {
        finished = true;
        signal.removeEventListener("abort", onAbort);
        if (typeof child.pid === "number") procRegistry.untrack(child.pid);
      };
      void child.then(done, done);
      return child;
    };
  };

/** Split a byte/string stream into lines, calling `onLine` for each non-empty one. */
export async function streamLines(
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
