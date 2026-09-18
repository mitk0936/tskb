import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Verdict } from "../client/types.ts";

/**
 * The structured outcome of a settled run — the verdict a client can act on.
 *
 * A `type`, not an `interface`, on purpose: the SDK types `structuredContent` as
 * `{ [x: string]: unknown }`, and TypeScript gives an implicit index signature to type
 * aliases but not to interfaces. As an interface this is not assignable and the tool
 * cannot return it.
 */
export type RunVerdict = {
  readonly ok: boolean;
  /** Absolute path of the run folder, or "" when the child died before settling. */
  readonly folder: string;
  readonly assertions: { readonly passed: number; readonly failed: number };
  readonly failures: ReadonlyArray<{ action: string; error: string }>;
  /** The recap block the terminal would have printed. */
  readonly summary: readonly string[];
};

/**
 * Turn a session's {@link Verdict} into a structured one by reading the run's own
 * `result.json`. The channel carries ok / folder / summary; the assert tally and the
 * per-action failures are written to disk by the run itself, so they are read back from
 * there rather than re-derived by parsing the summary lines.
 *
 * A missing or unreadable `result.json` is not an error: a child that died before
 * finalize has none, and the verdict is still true as far as it goes.
 */
interface ResultFile {
  ok?: boolean;
  assertions?: { passed: number; failed: number };
  failures?: Array<{ action: string; error: string }>;
}

/** The run's own `result.json`, or undefined when there isn't a readable one. */
async function readResult(folder: string): Promise<ResultFile | undefined> {
  try {
    return JSON.parse(await readFile(path.join(folder, "result.json"), "utf8")) as ResultFile;
  } catch {
    return undefined;
  }
}

export async function readVerdict(verdict: Verdict): Promise<RunVerdict> {
  const base = {
    // The channel's `ok` wins over the file's: it also covers a child that died before
    // writing one, which `result.json` by definition cannot report.
    ok: verdict.ok,
    folder: verdict.folder,
    summary: verdict.summary,
    assertions: { passed: 0, failed: 0 },
    failures: [] as ReadonlyArray<{ action: string; error: string }>,
  };
  if (!verdict.folder) return base;
  const parsed = await readResult(verdict.folder);
  if (!parsed) return base;
  return {
    ...base,
    assertions: parsed.assertions ?? base.assertions,
    failures: parsed.failures ?? base.failures,
  };
}

/**
 * The verdict of a run this process never supervised — read entirely from disk. There is
 * no channel to trust here, so `ok` comes from the file; a folder without a readable
 * `result.json` is reported as not ok, because a run that never wrote one did not finish.
 */
export async function readVerdictAt(folder: string): Promise<RunVerdict> {
  const parsed = await readResult(folder);
  return {
    ok: parsed?.ok ?? false,
    folder,
    summary: [],
    assertions: parsed?.assertions ?? { passed: 0, failed: 0 },
    failures: parsed?.failures ?? [],
  };
}
