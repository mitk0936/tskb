import createDebug from "debug";
import { format } from "node:util";

// debug copies `inspectOpts` onto each logger instance at creation time, so the
// default object-inspection depth must be set BEFORE any createLogger() runs.
// This module is imported (and fully evaluated) before importing modules execute
// their top-level createLogger() calls, so setting it here reaches every instance.
// DEBUG_DEPTH env wins; else 4 (so nested state isn't truncated to `[Object]`).
{
  const opts = (createDebug as unknown as { inspectOpts?: Record<string, unknown> }).inspectOpts;
  if (opts) opts.depth = process.env.DEBUG_DEPTH ? Number(process.env.DEBUG_DEPTH) : 4;
}

/** Numeric verbosity levels. Lower = more important / more likely visible. */
export const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
} as const;

export type LevelName = keyof typeof LEVELS;

/** Root namespace prepended to every logger. */
const ROOT = "tskb";

/** Module-level threshold. Messages with LEVELS[level] <= threshold may emit. */
let threshold: number = LEVELS.info;

type Message = string | (() => string);
type LogFn = (msg: Message, ...args: unknown[]) => void;

export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  /** Timer whose label + elapsed ms both log at `debug` level. */
  time(label: string): () => void;
  /** Timer whose label logs at `info` and elapsed ms at `debug`. */
  infoTime(label: string): () => void;
}

/** Resolve a message that may be a lazy function. */
function resolve(msg: Message): string {
  return typeof msg === "function" ? msg() : msg;
}

/**
 * Parse a level from a string: accepts a name ("debug") or a number ("3").
 * Returns undefined if unrecognized.
 */
export function parseLevel(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed in LEVELS) return LEVELS[trimmed as LevelName];
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 0 && n <= LEVELS.trace) return n;
  return undefined;
}

/**
 * Configure logging once at startup.
 *
 * Two tiers:
 * - Normal output (error/warn/info) is always on, gated only by the numeric
 *   threshold. info → stdout; warn/error → stderr. Plain, undecorated.
 * - The namespaced firehose (debug/trace) is OFF by default. `--verbose` turns
 *   it on for all `tskb:*` namespaces; an explicit DEBUG selection (read by the
 *   debug lib on import) turns on exactly what the user named. Enabling either
 *   raises the threshold so the firehose is actually visible.
 *
 * Level: TSKB_LOG_LEVEL env wins; else `trace` when the firehose is on; else `info`.
 * (Object inspect depth is set at module load — see the top of this file.)
 */
export function configure(opts: { verbose: boolean }): void {
  const envLevel = parseLevel(process.env.TSKB_LOG_LEVEL);
  const firehoseOn = opts.verbose || !!process.env.DEBUG;
  threshold = envLevel ?? (firehoseOn ? LEVELS.trace : LEVELS.info);

  if (opts.verbose) {
    // --verbose enables every tskb namespace, preserving any explicit DEBUG too.
    createDebug.enable(process.env.DEBUG ? `${process.env.DEBUG},${ROOT}:*` : `${ROOT}:*`);
  }
  // Otherwise: no --verbose. If DEBUG is set, the debug lib already enabled the
  // named namespaces on import; if not, the firehose stays off. Either way the
  // normal error/warn/info output is unaffected.
}

/** Create a namespaced logger. `ns` is appended to the `tskb:` root. */
export function createLogger(ns: string): Logger {
  const d = createDebug(`${ROOT}:${ns}`);

  // Plain, undecorated output for always-on user-facing levels.
  const plain = (level: number, stream: NodeJS.WriteStream): LogFn => {
    return (msg, ...args) => {
      if (level > threshold) return; // cheap numeric gate, runs before formatting
      stream.write(format(resolve(msg), ...args) + "\n");
    };
  };

  // Namespaced/colored firehose for opt-in diagnostics (debug/trace).
  const fire = (level: number): LogFn => {
    return (msg, ...args) => {
      if (level > threshold) return; // numeric gate
      if (!d.enabled) return; // namespace gate (DEBUG / --verbose)
      d(resolve(msg), ...args);
    };
  };

  const infoFn = plain(LEVELS.info, process.stdout);
  const debugFn = fire(LEVELS.debug);

  return {
    error: plain(LEVELS.error, process.stderr),
    warn: plain(LEVELS.warn, process.stderr),
    info: infoFn,
    debug: debugFn,
    trace: fire(LEVELS.trace),
    time(label) {
      const start = performance.now();
      debugFn(`${label}...`);
      return () => debugFn(`${label} (${Math.round(performance.now() - start)}ms)`);
    },
    infoTime(label) {
      const start = performance.now();
      infoFn(`${label}...`);
      return () => debugFn(`${label} (${Math.round(performance.now() - start)}ms)`);
    },
  };
}
