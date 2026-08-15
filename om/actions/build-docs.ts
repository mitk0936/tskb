import path from "node:path";
import { z } from "zod";
import { action } from "omkit";

/**
 * The shape of a docs build.
 *
 * Declared as a zod schema so `.args()` can pin it — but note that on an **action** the pin
 * is type-level only. An action called from an om body is handed its arguments directly in
 * code, so nothing here is validated, defaulted, or prompted for at runtime. Only an om's
 * `.args()` resolves.
 *
 * That is why the optional fields use `.optional()` and not `.default()`. `.args()` infers
 * the schema's *output* type, in which a `.default()` field is non-optional: callers would
 * be forced to pass it and no default would ever be applied, because nothing runs the parse.
 * `.optional()` keeps them omittable and leaves the real defaults in the destructuring
 * below, which is where they actually take effect.
 */
export const buildDocsArgs = z.object({
  /** Glob for the .tskb.tsx documentation files, e.g. "./docs/ **\/*.tskb.tsx". */
  pattern: z.string(),
  /** Path to the tsconfig used to type-check the docs. */
  config: z.string(),
  /** Display name of the project in the generated graph. */
  projectName: z.string(),
  /**
   * Directory to run in. Relative paths resolve against the directory node was executed
   * from (process.cwd()). Defaults to process.cwd().
   */
  cwd: z.string().optional(),
  /**
   * Turn on tskb's diagnostic firehose (passes --verbose). Normal build output shows either
   * way; this adds the namespaced debug/trace logging. Default: off.
   */
  verbose: z.boolean().optional(),
});

export type BuildDocsOptions = z.infer<typeof buildDocsArgs>;

export const buildDocs = action("Build Docs")
  .describe({ summary: "Build the tskb knowledge graph from the repo's .tskb.tsx docs." })
  .args(buildDocsArgs)
  .run(({ proc }, { pattern, config, projectName, cwd = ".", verbose = false }) => {
    // path.resolve keeps an absolute cwd as-is and resolves a relative one
    // against process.cwd() — exactly the "absolute from where node runs" rule.
    const resolvedCwd = path.resolve(cwd);
    // Build the flag as an array so zx flattens it; [] contributes nothing.
    const flags = verbose ? ["--verbose"] : [];
    // proc sources the LogsCollector from async context and streams output into it.
    return proc("build-docs", {
      cwd: resolvedCwd,
    })`npx --no -- tskb ${pattern} --tsconfig ${config} --project ${projectName} ${flags}`;
  });
