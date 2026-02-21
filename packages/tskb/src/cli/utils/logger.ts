let isVerbose = false;

export function configure(opts: { verbose: boolean }): void {
  isVerbose = opts.verbose;
}

export function info(msg: string): void {
  process.stderr.write(msg + "\n");
}

export function verbose(msg: string): void {
  if (isVerbose) process.stderr.write(msg + "\n");
}

export function error(msg: string): void {
  process.stderr.write(msg + "\n");
}

/**
 * Start a verbose-only timer. The label and elapsed time are only shown in verbose mode.
 * Use this in query commands (search, pick, ls, context, docs) to keep stdout JSON-clean.
 */
export function time(label: string): () => void {
  const start = performance.now();
  verbose(`${label}...`);
  return () => {
    const ms = Math.round(performance.now() - start);
    verbose(`${label} (${ms}ms)`);
  };
}

/**
 * Start a timer that always logs the label via info, and elapsed time via verbose.
 * Use this in the build command where progress output is expected.
 */
export function infoTime(label: string): () => void {
  const start = performance.now();
  info(`${label}...`);
  return () => {
    const ms = Math.round(performance.now() - start);
    verbose(`${label} (${ms}ms)`);
  };
}
