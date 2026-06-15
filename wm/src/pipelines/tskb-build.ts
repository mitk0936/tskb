import { run } from "../../core/run.ts";
import { snapshot } from "../../core/output.ts";
import { buildDocs } from "../actions/build-docs.ts";
import { watchDir } from "../actions/watch-dir.ts";

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

const build = run(
  // Watch the graph the build regenerates; each change is one of the watcher's
  // own events, which also lands in the global log.
  watchBuildDir,
  // The build proc exiting fires the system `done` event (no log-scraping); when
  // it does, tear everything down — build + watcher.
  buildRepoDocs.once("done", () => {
    build.cancel();
  })
).drain();
