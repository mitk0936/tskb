import createDebug from "debug";

/** Numeric verbosity levels. Lower = more important / more likely visible. */
export const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
} as const;

export type LevelName = keyof typeof LEVELS;

const ROOT = "tskb";
let threshold: number = LEVELS.info;

type Message = string | (() => string);
type LogFn = (msg: Message, ...args: unknown[]) => void;

export interface Logger {
  error: LogFn;
  warn: LogFn;
  info: LogFn;
  debug: LogFn;
  trace: LogFn;
  /** Timer whose label + elapsed ms both log at `debug` (firehose) level. */
  time(label: string): () => void;
  /** Timer whose label logs at `info` and elapsed ms at `debug` (firehose). */
  infoTime(label: string): () => void;
}

function resolve(msg: Message): string {
  return typeof msg === "function" ? msg() : msg;
}

function parseLevel(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed in LEVELS) return LEVELS[trimmed as LevelName];
  const n = Number(trimmed);
  if (Number.isInteger(n) && n >= 0 && n <= LEVELS.trace) return n;
  return undefined;
}

/**
 * Configure browser logging once at startup. Two tiers (mirrors the node logger):
 * - Normal output (error/warn/info) always on, gated by threshold → console.*.
 * - Firehose (debug/trace) namespaced via the debug lib → console, OFF unless a
 *   namespace is selected.
 *
 * Config sources (in order): ?debug= and ?log= URL params (written through to
 * localStorage), then localStorage.debug (namespaces) and localStorage.tskb_log_level
 * (level). Enabling the firehose raises the threshold so it is actually visible.
 *
 * Safe to call where window/localStorage are unavailable (e.g. a worker): it no-ops
 * the unavailable parts and leaves the firehose off.
 */
export function configure(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlDebug = params.get("debug");
    const urlLog = params.get("log");
    if (urlDebug !== null) localStorage.setItem("debug", urlDebug);
    if (urlLog !== null) localStorage.setItem("tskb_log_level", urlLog);
  } catch {
    // window/localStorage unavailable — ignore.
  }

  let ns: string | null = null;
  let levelRaw: string | null = null;
  try {
    ns = localStorage.getItem("debug");
    levelRaw = localStorage.getItem("tskb_log_level");
  } catch {
    // ignore
  }

  const firehoseOn = !!ns && ns.length > 0;
  threshold = parseLevel(levelRaw) ?? (firehoseOn ? LEVELS.trace : LEVELS.info);
  if (firehoseOn) createDebug.enable(ns!);
}

/** Create a namespaced logger. `ns` is appended to the `tskb:` root. */
export function createLogger(ns: string): Logger {
  const d = createDebug(`${ROOT}:${ns}`);

  // Plain, undecorated output for always-on user-facing levels.
  const plain = (level: number, sink: (...a: unknown[]) => void): LogFn => {
    return (msg, ...args) => {
      if (level > threshold) return;
      sink(resolve(msg), ...args);
    };
  };

  // Namespaced firehose for opt-in diagnostics (debug/trace).
  const fire = (level: number): LogFn => {
    return (msg, ...args) => {
      if (level > threshold) return;
      if (!d.enabled) return;
      d(resolve(msg), ...args);
    };
  };

  const infoFn = plain(LEVELS.info, console.info.bind(console));
  const debugFn = fire(LEVELS.debug);

  return {
    error: plain(LEVELS.error, console.error.bind(console)),
    warn: plain(LEVELS.warn, console.warn.bind(console)),
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
