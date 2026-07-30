import path from "node:path";
import { om } from "omkit";
import { watchDir } from "omkit/actions";
import { buildDocs } from "../actions/build-docs.ts";

// Resolve the repo root from this file's own location, not process.cwd(): `omkit run` launches the
// om with its cwd set to the om file's directory (om/oms), so a cwd-relative "../" would land in
// om/ and the docs glob would match nothing. An absolute root keeps the build correct no matter
// where it's launched from. This file sits at om/oms, so two levels up is the repo root.
const repoRoot = path.resolve(import.meta.dirname, "../../");

const buildConfig = {
  cwd: repoRoot,
  pattern: "./docs/**/*.tskb.tsx",
  config: "./docs/tsconfig.json",
  projectName: "TSKB Monorepo",
  verbose: true, // flip to false to quiet the diagnostic firehose
};

om("tskb:build").run(async ({ snapshot }) => {
  void snapshot("build-config", buildConfig);

  const watchBuildDirectory = watchDir(path.join(repoRoot, ".tskb")).tag("watch:build:daemon");
  await buildDocs(buildConfig).tag("build").result;

  watchBuildDirectory.cancel();
});
