import { FolderCache } from "../../system/fs/FolderCache.ts";
import type { Outcome, SystemGlobal } from "./types.ts";

/**
 * The cache-gated run behind {@link ActionInstance.withCache}. Fingerprints the
 * already-resolved `targets` (the action's *inputs*); on a hit, logs `cached,
 * skipping` and returns `undefined`; otherwise runs `inner` with the wrapper's
 * injected services, re-throwing its failure (so the wrapper fails too) and
 * recording the fingerprint only on success.
 */
export async function cachedRun<Result>(
  inner: { start(system: SystemGlobal): Promise<Outcome<Result>> },
  name: string,
  targets: string[],
  ctx: SystemGlobal
): Promise<Result | undefined> {
  const fp = await FolderCache.fingerprint(targets);
  if ((await FolderCache.read(targets)) === fp) {
    ctx.logs.append({ source: name, level: "info", message: "cached, skipping" });
    return undefined;
  }
  const outcome = await inner.start({
    logs: ctx.logs,
    signal: ctx.signal,
    nod: ctx.nod,
    output: ctx.output,
    assert: ctx.assert,
  });
  // Re-throw the inner failure so the wrapper fails too (the framework re-wraps it
  // into this wrapper's own Outcome); only record on success.
  if (!outcome.ok) throw outcome.error;
  await FolderCache.write(targets, fp);
  return outcome.value;
}
