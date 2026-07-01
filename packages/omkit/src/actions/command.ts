import path from "node:path";
import { action } from "../core/action.ts";

/** Tunes an action built with {@link command}. */
export interface CommandOptions {
  /**
   * Directory to run the command in. Relative paths resolve against the directory
   * node was executed from (process.cwd()). Default ".".
   */
  cwd?: string;
  /** Label the child's output is logged under. Defaults to the action's name. */
  label?: string;
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
 * Runs a fixed shell command via `proc` as an action **instance** — built in a
 * single call, the same shape as every other bundled action (`healthcheck`,
 * `prompt`, …), rather than a factory you instantiate separately. `name`
 * identifies it across the run (the `launch <name>` line and the proc's log
 * source); `cmd` runs verbatim in the resolved `cwd`.
 *
 *   run(
 *     command("TSKB:dev", "npm run dev:explorer", { cwd: pkg }),
 *     command("TSKB:test", "npm test", { cwd: repo }),
 *   );
 *
 * For anything beyond a static command — interpolated args, emitted events, a
 * daemon loop — drop down to `action(...).run(...)` directly.
 */
export const command = (name: string, cmd: string, options: CommandOptions = {}) =>
  action(name).run(({ proc }) => {
    // path.resolve keeps an absolute cwd as-is and resolves a relative one
    // against process.cwd() — exactly the "absolute from where node runs" rule.
    const cwd = path.resolve(options.cwd ?? ".");
    // proc sources the LogsCollector from async context and streams output into it.
    return proc(options.label ?? name, { cwd })(verbatim(cmd));
  })(); // construct the instance here, so callers get one in a single call
