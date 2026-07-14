import { om } from "omkit";
import { watchDir } from "omkit/actions";
import { buildDocs } from "../actions/build-docs.ts";

// The watcher emits its own events (also pushed to the global log); no bus needed.
const watchBuildDir = watchDir("../.tskb");

const buildConfig = {
  cwd: "../",
  pattern: "./docs/**/*.tskb.tsx",
  config: "./docs/tsconfig.json",
  projectName: "TSKB Monorepo",
  verbose: true, // flip to true to see the diagnostic firehose
};

const buildRepoDocs = buildDocs(buildConfig);

// Watch the graph dir while the build regenerates it, then stop once the build
// process exits. The run tears down when the body returns (or throws).
om(async ({ cancel, snapshot }) => {
  // Capture the run's inputs as a snapshot — part of the world model the log
  // narrates. Taken inside the body so it lands in this run's own output folder.
  void snapshot("build-config", buildConfig);

  // Watch the graph the build rewrites; each change lands in the log as an event.
  const watchBuild = watchBuildDir.exec().tag("watch:build:daemon");
  // Run the build to completion (its proc exiting settles `.result`)…
  const built = await buildRepoDocs.exec().tag("build").result;
  if (!built.ok) throw built.error; // build failed → fault the run (exit 1)
  // …then tear everything down — build's done, so the watcher's job is too.
  watchBuild.cancel();
});
