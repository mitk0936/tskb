import path from "node:path";
import { z } from "zod";
import { om } from "omkit";
import { watchDir } from "omkit/actions";
import { buildDocs } from "../actions/build-docs.ts";

// Resolve the repo root from this file's own location, not process.cwd(): `omkit run` launches the
// om with its cwd set to the om file's directory (om/oms), so a cwd-relative "../" would land in
// om/ and the docs glob would match nothing. An absolute root keeps the build correct no matter
// where it's launched from. This file sits at om/oms, so two levels up is the repo root.
const repoRoot = path.resolve(import.meta.dirname, "../../");

/**
 * What this build lets you vary from outside. Unlike the action's schema, an om's `.args()`
 * really resolves: supplied values win, then these defaults, then a prompt, then the run
 * fails. Both fields are defaulted, so `omkit run tskb:build` never has to ask — the
 * defaults are the behaviour this om had when they were hardcoded.
 *
 * Supply them as JSON, e.g. OMKIT_ARGS='{"verbose":false}'.
 */
const tskbBuildArgs = z.object({
  /** Turn on tskb's diagnostic firehose. Was a hardcoded `true` with a "flip to quiet" note. */
  verbose: z.boolean().default(true),
  /** Display name of the project in the generated graph. */
  projectName: z.string().default("TSKB Monorepo"),
});

om("tskb:build")
  .describe({ summary: "Rebuild the tskb knowledge graph from this repo's .tskb.tsx docs." })
  // Settling (the default): it finishes on its own, so an assistant can run it and wait
  // for the verdict rather than starting it and checking back.
  .mcp()
  .args(tskbBuildArgs)
  .run(async ({ snapshot }, { verbose, projectName }) => {
    const buildConfig = {
      cwd: repoRoot,
      pattern: "./docs/**/*.tskb.tsx",
      config: "./docs/tsconfig.json",
      projectName,
      verbose,
    };
    void snapshot("build-config", buildConfig);

    const watchBuildDirectory = watchDir(path.join(repoRoot, ".tskb")).tag("watch:build:daemon");
    await buildDocs(buildConfig).tag("build").result;

    watchBuildDirectory.cancel();
  });
