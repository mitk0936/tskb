import { AsyncLocalStorage } from "node:async_hooks";
import { format } from "node:util";
import type { Logger } from "./LogsCollector.ts";

/**
 * The path of the action whose async context is currently executing (e.g.
 * "Build", "Dev › Server"). `SpinHost.launch` wraps each action's `start` in
 * `actionScope.run(path, …)`, so any `console.*` call inside that action's
 * (a)synchronous body reads its path here. No store → the call ran outside any
 * action (the spin body, top-level, a third-party module init).
 */
export const actionScope = new AsyncLocalStorage<string>();

/** The console methods we fold into the log, each mapped to its log level. */
const LEVELS = {
  log: "info",
  info: "info",
  debug: "debug",
  warn: "warn",
  error: "error",
} as const;

type ConsoleMethod = keyof typeof LEVELS;

// console's DOM/node type is awkward to index/reassign; a plain callable map is
// enough for save + patch and sidesteps fighting the lib type.
type ConsoleFns = Record<ConsoleMethod, (...args: unknown[]) => void>;

/**
 * Patch `console.log/info/debug/warn/error` so each call appends into `logs`
 * instead of writing to the terminal, attributing every line to the current
 * action via {@link actionScope}. Returns a `restore()` that reinstalls the
 * methods that were installed when this ran — so sequential runs nest cleanly
 * (save-current / restore-saved).
 *
 * The patched methods do **not** echo to the terminal: their output reaches it
 * through the run's log renderer (the caller keeps the original `console.log`
 * for the renderer's own writes). Args are rendered with `util.format` (exact
 * console semantics), split on newlines, and appended line-by-line; an empty
 * render is skipped.
 */
export function captureConsole(logs: Logger): () => void {
  const c = console as unknown as ConsoleFns;
  const saved = {} as ConsoleFns;
  const methods = Object.keys(LEVELS) as ConsoleMethod[];

  for (const method of methods) {
    saved[method] = c[method];
    const level = LEVELS[method];
    c[method] = (...args: unknown[]): void => {
      const path = actionScope.getStore();
      const source = path ? `${path} › console` : "console";
      const text = format(...args);
      for (const line of text.split("\n")) {
        if (line) logs.append({ source, level, message: line });
      }
    };
  }

  return (): void => {
    for (const method of methods) c[method] = saved[method];
  };
}
