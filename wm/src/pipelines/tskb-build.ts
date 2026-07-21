import { om } from "omkit";
import { watchDir } from "omkit/actions";
import { buildDocs } from "../actions/build-docs.ts";

const buildConfig = {
  cwd: "../",
  pattern: "./docs/**/*.tskb.tsx",
  config: "./docs/tsconfig.json",
  projectName: "TSKB Monorepo",
  verbose: true, // flip to false to quiet the diagnostic firehose
};

om("tskb:build", async ({ snapshot }) => {
  void snapshot("build-config", buildConfig);

  const watchBuildDirectory = watchDir("../.tskb").tag("watch:build:daemon");
  await buildDocs(buildConfig).tag("build").once("done");

  watchBuildDirectory.cancel();
});
