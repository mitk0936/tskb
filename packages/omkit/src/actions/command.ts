import path from "node:path";
import { action } from "../core/action.ts";

/** Tunes an action built with {@link command}. */
export interface CommandOptions {
  /** Directory to run in; relative paths resolve against `process.cwd()`. Default ".". */
  cwd?: string;
  /** Full environment for the child (handed as-is, not merged). Omit to inherit. */
  env?: NodeJS.ProcessEnv;
  /** Let this command inherit the orchestrator's debugger (default false). */
  inheritDebugger?: boolean;
}

/**
 * Build a zx tagged template that runs `cmd` verbatim — zx only quotes interpolated
 * args, not the template's `pieces`, so the whole (developer-supplied) command in
 * `pieces` runs exactly as written (pipes, globs, `&&`).
 */
const verbatim = (cmd: string): TemplateStringsArray =>
  Object.assign([cmd], { raw: [cmd] }) as unknown as TemplateStringsArray;

/**
 * Runs a fixed shell command as an action instance. Output streams into the run's
 * log under `name`; a non-zero exit fails the action; teardown kills the child.
 * For interpolated args, events, or a daemon loop, drop to `action(...).run(...)`.
 */
export function command(name: string, cmd: string, options: CommandOptions = {}) {
  return action(name).run((ctx) => {
    const cwd = path.resolve(options.cwd ?? ".");
    return ctx.proc(name, {
      cwd,
      ...(options.env ? { env: options.env } : {}),
      ...(options.inheritDebugger ? { inheritDebugger: true } : {}),
    })(verbatim(cmd));
  })();
}
