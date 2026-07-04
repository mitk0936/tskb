import { spin, snapshot } from "omkit";
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

// Capture the run's inputs as a snapshot — part of the world model the log narrates.
void snapshot("build-config", buildConfig);

const buildRepoDocs = buildDocs(buildConfig);

// Watch the graph dir while the build regenerates it, then stop once the build
// process exits. Auto-drains (the spin default).
spin(async ({ nod, cancel }) => {
  // Watch the graph the build rewrites; each change lands in the log as an event.
  nod(watchBuildDir);
  // Run the build to completion (its proc exiting resolves `.done` with an Outcome)…
  await nod(buildRepoDocs).done;
  // …then tear everything down — build's done, so the watcher's job is too.
  cancel();
});
