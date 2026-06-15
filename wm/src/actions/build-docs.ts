import path from "node:path";
import { action } from "../../core/action.ts";

export interface BuildDocsOptions {
  /** Glob for the .tskb.tsx documentation files, e.g. "./docs/**\/*.tskb.tsx". */
  pattern: string;
  /** Path to the tsconfig used to type-check the docs. */
  config: string;
  /** Display name of the project in the generated graph. */
  projectName: string;
  /**
   * Directory to run in. Relative paths resolve against the directory node was
   * executed from (process.cwd()). Defaults to process.cwd().
   */
  cwd?: string;
  /**
   * Turn on tskb's diagnostic firehose (passes --verbose). Normal build output
   * shows either way; this adds the namespaced debug/trace logging. Default: off.
   */
  verbose?: boolean;
}

export const buildDocs = action("Build Docs").run(
  ({ proc }, { pattern, config, projectName, cwd = ".", verbose = false }: BuildDocsOptions) => {
    // path.resolve keeps an absolute cwd as-is and resolves a relative one
    // against process.cwd() — exactly the "absolute from where node runs" rule.
    const resolvedCwd = path.resolve(cwd);
    // Build the flag as an array so zx flattens it; [] contributes nothing.
    const flags = verbose ? ["--verbose"] : [];
    // proc sources the LogsCollector from async context and streams output into it.
    return proc("build-docs", {
      cwd: resolvedCwd,
    })`tskb ${pattern} --tsconfig ${config} --project ${projectName} ${flags}`;
  }
);
