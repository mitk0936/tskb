/**
 * tswm/actions — reusable actions built on the core engine.
 *
 * Each is a ready-made {@link action} for a common orchestration need; for
 * anything beyond these, drop down to `action(...).run(...)` from `tswm`.
 */

export { command } from "./command.ts";
export type { CommandOptions } from "./command.ts";

export { watch } from "./watch.ts";
export type { FileEvent, FileListener, WatchOptions } from "./watch.ts";

export { watchDir } from "./watch-dir.ts";
export type { WatchDirOptions, WatchDirEvents } from "./watch-dir.ts";

export { untilLog } from "./until-log.ts";
export type { LogMatcher, UntilLogOptions, UntilLogEvents } from "./until-log.ts";

export { tailLog } from "./tail-log.ts";
export type { TailLogOptions } from "./tail-log.ts";

export { prompt } from "./prompt.ts";
export type {
  PromptOptions,
  InputPromptOptions,
  ChoicePromptOptions,
  PromptChoice,
  PromptVia,
  PromptEvents,
} from "./prompt.ts";

export { healthcheck } from "./healthcheck.ts";
export type {
  HealthcheckOptions,
  HealthcheckResult,
  HealthcheckEvents,
  StatusMatcher,
  BodyMatcher,
} from "./healthcheck.ts";

export { chromePage } from "./chrome-page.ts";
export type {
  ChromePageOptions,
  ChromePageEvents,
  ChromePageSource,
  Page,
  Browser,
  BrowserContext,
} from "./chrome-page.ts";
