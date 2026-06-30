/**
 * tswm/actions — reusable actions built on the core engine.
 *
 * Each is a ready-made {@link action} for a common orchestration need; for
 * anything beyond these, drop down to `action(...).run(...)` from `tswm`.
 */

export { command } from "./command.ts";
export type { CommandParams, CommandOptions } from "./command.ts";

export { watch } from "./watch.ts";
export type { FileEvent, FileListener, WatchOptions } from "./watch.ts";

export { watchDir } from "./watch-dir.ts";
export type { WatchDirOptions, WatchDirEvents } from "./watch-dir.ts";

export { untilLog } from "./until-log.ts";
export type { LogMatcher, UntilLogOptions, UntilLogEvents } from "./until-log.ts";
