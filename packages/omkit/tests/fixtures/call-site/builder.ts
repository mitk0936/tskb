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
 * The ground-truth identity for `builder-cross-file` as defined here: both `om(name)`
 * and `.run(body)` are written in this file, so this resolves to *this* file's identity
 * no matter which of the two the capture reads from. That's what `builder.run(...)`,
 * triggered from the test file, must match.
 */
export const runFromFixture = (body: (ctx: OmContext) => Promise<void> | void): Promise<void> =>
  om("builder-cross-file").run(body);
