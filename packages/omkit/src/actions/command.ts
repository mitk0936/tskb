import { spawn } from "node:child_process";
import path from "node:path";
import { action } from "../orchestration/action/action.ts";
import type { AnyActionInstance } from "../orchestration/action/types.ts";
import { killTree } from "../system/process/process.ts";
import type { SnapshotStore } from "../output/snapshot/SnapshotStore.ts";

/** Tunes an action built with {@link command}. */
export interface CommandOptions {
  /**
   * Directory to run the command in. Relative paths resolve against the directory
   * node was executed from (process.cwd()). Default ".".
   */
  cwd?: string;
  /**
   * Environment for the child. Pass the full set you want (e.g.
   * `{ ...process.env, NODE_ENV: "development" }`) — it's handed to the child
   * as-is, not merged. Omit to inherit the parent's `process.env`.
   */
  env?: NodeJS.ProcessEnv;
}

/**
 * Build the literal part of a zx tagged template from a command string, so it
 * runs verbatim. zx only quotes interpolated args, not the template's `pieces` —
 * so placing the whole command in `pieces` is identical to writing it inline as
 * `` proc`cmd` ``. The command is developer-supplied (not user input), so
 * verbatim is exactly what we want.
 */
const verbatim = (cmd: string): TemplateStringsArray =>
  Object.assign([cmd], { raw: [cmd] }) as unknown as TemplateStringsArray;

/**
 * Runs a fixed command as an action **instance** — built in a single call, the
 * same shape as every other bundled action (`healthcheck`, `prompt`, …), rather
 * than a factory you instantiate separately. `name` identifies it across the run
 * (the `launch <name>` line and the child's log source).
 *
 * Two forms:
 *
 * - **Shell form** — `command(name, cmd, opts)`. The string runs verbatim
 *   through a shell (PowerShell on Windows), so pipes, globs, and `&&` work:
 *
 *     command("TSKB:dev", "npm run dev:explorer", { cwd: pkg })
 *
 *   The direct child is the *shell*, and the real program is a grandchild. On
 *   Windows teardown reaps the tree only while that shell is alive — so a GUI
 *   app that ignores console Ctrl-C (Electron) can be **orphaned and survive**.
 *
 * - **Direct form** — `command(name, file, args, opts)`. Spawns `file` with
 *   `args` **without a shell**, so the action's direct child *is* the program.
 *   On teardown it's force-reaped by its own PID (`taskkill /F /T`), so it dies
 *   even when a shell would have orphaned it. Use this for long-lived apps you
 *   launch and must be able to kill on Ctrl-C:
 *
 *     command("platform", electronExe, [".", "--inspect"], { cwd: app })
 *
 *   `file` must be a real executable (an actual `electron.exe`), not a `.cmd`
 *   shim — shims need a shell to run.
 *
 * For anything beyond a static command — interpolated args, emitted events, a
 * daemon loop — drop down to `action(...).run(...)` directly.
 */
export function command(name: string, cmd: string, options?: CommandOptions): AnyActionInstance;
export function command(
  name: string,
  file: string,
  args: string[],
  options?: CommandOptions
): AnyActionInstance;
export function command(
  name: string,
  cmdOrFile: string,
  argsOrOptions?: string[] | CommandOptions,
  maybeOptions?: CommandOptions
): AnyActionInstance {
  const direct = Array.isArray(argsOrOptions);
  const options = (direct ? maybeOptions : (argsOrOptions as CommandOptions)) ?? {};

  if (direct) {
    return action(name).run((ctx) =>
      spawnDirect(
        ctx.output.snapshots,
        ctx.logs,
        ctx.signal,
        name,
        cmdOrFile,
        argsOrOptions,
        options
      )
    )();
  }

  return action(name).run(({ proc }) => {
    // path.resolve keeps an absolute cwd as-is and resolves a relative one
    // against process.cwd() — exactly the "absolute from where node runs" rule.
    const cwd = path.resolve(options.cwd ?? ".");
    // proc sources the LogsCollector from async context and streams output into it.
    return proc(name, {
      cwd,
      ...(options.env ? { env: options.env } : {}),
    })(verbatim(cmdOrFile));
  })(); // construct the instance here, so callers get one in a single call
}

/**
 * The direct (shell-less) launcher behind {@link command}'s four-arg form.
 * Spawns `file`/`args` with no shell — so the returned child *is* the program,
 * killable by its own PID on teardown — streams its stdout/stderr into the run's
 * log, and resolves when it exits (0 = ok; a non-zero exit is a genuine failure,
 * unless the run is tearing down, where the abort-kill is the reason).
 */
const spawnDirect = (
  snapshots: SnapshotStore,
  logs: import("../output/log/LogsCollector.ts").Logger,
  signal: AbortSignal,
  name: string,
  file: string,
  args: string[],
  options: CommandOptions
): Promise<void> => {
  const cwd = path.resolve(options.cwd ?? ".");
  const source = name;

  // windowsHide keeps a stray console window from flashing for the child.
  // env omitted -> spawn inherits the parent's process.env (Node's default).
  const child = spawn(file, args, { cwd, windowsHide: true, env: options.env });

  // Mirror proc's launch line: a filterable milestone on the timeline, with the
  // structured args snapshotted and linked (see process.ts for the rationale).
  const snap = snapshots.captureJson(`proc-${name}-start`, { cmd: file, args, cwd });
  logs.append({
    source: name,
    level: "event",
    message: `${name} · start · ${file} ${args.join(" ")} · in ${cwd} · → ${snap.rel}`,
  });

  if (child.stdout) logs.attach(child.stdout, source, "info");
  if (child.stderr) logs.attach(child.stderr, source, "error");

  // Force-reap the child's tree on teardown, by its own PID. Guarded so a child
  // that has already exited isn't re-killed (its PID may have been reused).
  let finished = false;
  const onAbort = (): void => {
    if (finished || child.pid == null) return;
    killTree(child.pid);
  };
  const done = (): void => {
    finished = true;
    signal.removeEventListener("abort", onAbort);
  };
  if (signal.aborted) killTree(child.pid ?? -1);
  else signal.addEventListener("abort", onAbort, { once: true });

  return new Promise<void>((resolve, reject) => {
    child.on("error", (error) => {
      done();
      reject(error);
    });
    child.on("exit", (code, sig) => {
      done();
      // During teardown the abort-kill is why it exited — a clean shutdown, not a
      // fault; let it settle successfully so it isn't recorded as a failure.
      if (signal.aborted || code === 0) return resolve();
      // Non-zero exit: reject with an error carrying `exitCode`, so the framework
      // surfaces it on the action's Outcome (`{ ok: false, exitCode }`).
      const error = Object.assign(new Error(`${name} exited with ${code ?? sig}`), {
        exitCode: code ?? undefined,
      });
      reject(error);
    });
  });
};
