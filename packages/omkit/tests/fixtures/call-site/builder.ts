import { z } from "zod";
import { om } from "../../../src/index.ts";
import type { OmBuilder, OmBuilderArgs, OmContext } from "../../../src/index.ts";

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

/**
 * The same guard for the `.args()` link, which sits between `om(name)` and `.run(body)`:
 * `.args()` must thread the site captured here through to the run rather than re-capturing
 * it. Same om name as `builder` above, so it must hash to the same identity. The schema is
 * fully defaulted, so `.run()` resolves without prompting or `OMKIT_ARGS`.
 */
export const argsBuilder: OmBuilderArgs<z.ZodObject<{ rows: z.ZodDefault<z.ZodNumber> }>> = om(
  "builder-cross-file"
).args(z.object({ rows: z.number().default(1) }));
