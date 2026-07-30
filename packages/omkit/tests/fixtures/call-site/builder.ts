import { om } from "../../../src/index.ts";
import type { OmBuilder, OmContext } from "../../../src/index.ts";

/**
 * Exists to prove `om(name)`'s call-site capture happens once, right here — not
 * lazily inside `.run()`. `om-builder.test.ts` imports `builder` and calls `.run()`
 * on it from a different file; the run's identity must still resolve to *this*
 * file, not the test file that triggers `.run()`.
 */
export const builder: OmBuilder = om("builder-cross-file");

/**
 * The two-arg form's call, written in this same file — the "ground truth" identity
 * for `builder-cross-file` as defined here. The two-arg form has no builder
 * indirection to get wrong, so this is what `builder.run(...)` must match no matter
 * which file triggers it.
 */
export const runDirectlyFromHere = (
  body: (ctx: OmContext) => Promise<void> | void
): Promise<void> => om("builder-cross-file", body);
