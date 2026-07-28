/**
 * Stdout output helpers. NOT logging — these write command results to stdout.
 * All diagnostic logging lives in src/log/. See logging.tskb.tsx.
 */

/** Write a JSON value to stdout, compact when optimized is true. */
export function jsonOut(value: unknown, optimized: boolean): void {
  console.log(optimized ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

/** Write plain text to stdout. */
export function plainOut(text: string): void {
  console.log(text);
}
