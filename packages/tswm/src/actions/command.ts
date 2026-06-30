import path from "node:path";
import { action } from "../core/action.ts";

/** Params accepted by an action built with {@link command}. */
export interface CommandParams {
  /**
   * Directory to run the command in. Relative paths resolve against the directory
   * node was executed from (process.cwd()). Falls back to the action's configured
   * default, then ".".
   */
  cwd?: string;
}

/** Tunes an action built with {@link command}. */
export interface CommandOptions {
  /** Default working directory when an instance isn't given one. Defaults to ".". */
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
 * Defines an action that runs a fixed command via `proc` in a given cwd — the
 * shape shared by every "wrap a process" action (dev watchers, builders, …). It
 * owns the boilerplate those repeat: a `{ cwd }` param, resolving it to an
 * absolute path, and streaming the child into the log under a label.
 *
 *   export const devWatch = command("TSKB:devWatch", "npm run dev");
 *
 * The returned action's instance takes an optional {@link CommandParams}; its
 * `cwd` (or the configured default, then ".") is resolved against process.cwd().
 * For anything beyond a static command — interpolated args, emitted events, a
 * daemon loop — drop down to `action(...).run(...)` directly.
 */
export const command = (name: string, cmd: string, options: CommandOptions = {}) =>
  action(name).run(({ proc }, params: CommandParams = {}) => {
    const cwd = path.resolve(params.cwd ?? options.cwd ?? ".");
    return proc(options.label ?? name, { cwd })(verbatim(cmd));
  });
