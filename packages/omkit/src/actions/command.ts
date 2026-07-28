import { spawn } from "node:child_process";
import path from "node:path";
import { action } from "../core/action.ts";
import { debuggerFreeEnv, killTree, streamLines } from "../system/proc.ts";

/** Tunes an action built with {@link command}. */
export interface CommandOptions {
  /**
   * Launch `cmdOrFile` directly with these arguments instead of executing it
   * through a shell. Omit to run the command as a shell command.
   */
  args?: readonly string[];

  /** Directory to run in; relative paths resolve against `process.cwd()`. Default ".". */
  cwd?: string;

  /** Full environment for the child (handed as-is, not merged). Omit to inherit. */
  env?: NodeJS.ProcessEnv;

  /** Let this command inherit the orchestrator's debugger (default false). */
  inheritDebugger?: boolean;
}

/**
 * Build a zx tagged template that runs `cmd` verbatim.
 */
const verbatim = (cmd: string): TemplateStringsArray =>
  Object.assign([cmd], { raw: [cmd] }) as unknown as TemplateStringsArray;

/**
 * The action name a command runs under: the shell string itself, or `file arg1 arg2`
 * for the direct-exec form. Exposed so the naming rule stays independently checkable.
 */
export function commandName(cmdOrFile: string, options: CommandOptions = {}): string {
  return options.args === undefined ? cmdOrFile : [cmdOrFile, ...options.args].join(" ");
}

/**
 * Launches a command as an action, named after the command itself (add a semantic label
 * with `.tag(...)`), and returns the live instance — a normal action call, no extra `()`.
 * Must run inside an `om(...)` body, like any other action.
 *
 * By default the command is executed through the shell. If `options.args` is provided,
 * `cmdOrFile` is treated as an executable and launched directly without a shell.
 */
export function command(cmdOrFile: string, options: CommandOptions = {}) {
  const cwd = path.resolve(options.cwd ?? ".");
  const name = commandName(cmdOrFile, options);

  // Shell command — the command string is the action (and proc) name.
  if (options.args === undefined) {
    return action(name).run((ctx) =>
      ctx.proc(cmdOrFile, {
        cwd,
        ...(options.env && { env: options.env }),
        ...(options.inheritDebugger && {
          inheritDebugger: true,
        }),
      })(verbatim(cmdOrFile))
    )();
  }

  // Direct executable — the file plus its args form the action name.
  const args = options.args;
  return action(name).run(async (ctx) => {
    const inherit = options.inheritDebugger;

    const env = inherit
      ? (options.env ?? process.env)
      : debuggerFreeEnv(options.env ?? process.env);

    const child = spawn(cmdOrFile, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    console.log(`${name} · start · '${cmdOrFile}' ${args.join(" ")} · in ${cwd}`);

    void streamLines(child.stdout!, console.info);
    void streamLines(child.stderr!, console.error);

    let finished = false;

    const onAbort = (): void => {
      if (!finished && child.pid !== undefined) {
        killTree(child.pid);
      }
    };

    if (ctx.signal.aborted) {
      onAbort();
    } else {
      ctx.signal.addEventListener("abort", onAbort, { once: true });
    }

    try {
      await new Promise<void>((resolve, reject) => {
        child.once("error", (err) => {
          reject(new Error(`${name}: ${err.message}`, { cause: err }));
        });

        child.once("exit", (code, signal) => {
          finished = true;

          if (ctx.signal.aborted || code === 0) {
            resolve();
          } else {
            reject(
              Object.assign(
                new Error(
                  signal ? `${name} terminated by ${signal}` : `${name} exited with code ${code}`
                ),
                { exitCode: code ?? undefined }
              )
            );
          }
        });
      });
    } finally {
      finished = true;
      ctx.signal.removeEventListener("abort", onAbort);
    }
  })();
}
