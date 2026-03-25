export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, error?: Error, meta?: Record<string, unknown>): void;
}

export function createLogger(name: string): Logger {
  return {
    debug: (msg, meta) => console.debug(`[${name}]`, msg, meta),
    info: (msg, meta) => console.info(`[${name}]`, msg, meta),
    warn: (msg, meta) => console.warn(`[${name}]`, msg, meta),
    error: (msg, err, meta) => console.error(`[${name}]`, msg, err, meta),
  };
}
