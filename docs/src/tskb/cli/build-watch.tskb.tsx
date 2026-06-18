import { Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Refs ───────────────────────────────────────────────────────────────────

const BuildModule = ref as tskb.Modules["cli.commands.build"];
const BuildExport = ref as tskb.Exports["cli.build"];
const WatchModule = ref as tskb.Modules["cli.commands.watch"];
const WatchExport = ref as tskb.Exports["cli.commands.watch.watch"];
const WatcherModule = ref as tskb.Modules["cli.utils.watcher"];
const WatchPathsExport = ref as tskb.Exports["cli.utils.watcher.watchPaths"];
const GlobPatternTerm = ref as tskb.Terms["globPattern"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does `tskb build --watch` rebuild the graph when files change?">
    <H1>Build watch mode</H1>
    <P>
      Passing <code>--watch</code> turns {BuildModule} into a long-running process. Without it the
      build runs once and exits. With it, {BuildExport} runs once at startup and then again every
      time a watched file changes, so the graph stays current while you edit docs.
    </P>

    <H2>What gets watched</H2>
    <P>
      By default the watch set is the directories covered by the build {GlobPatternTerm} — so both
      edits to existing <code>.tskb.tsx</code> files and newly added ones trigger a rebuild. Each{" "}
      <code>--watch-path</code> adds another file or folder, which is useful for watching the source
      code that docs reference (its line-numbered stubs shift when that code changes).
    </P>

    <H2>The watcher</H2>
    <P>
      {WatcherModule} ({WatchPathsExport}) does the file watching. The operating system reports many
      noisy, repeated events for a single save, so the watcher collapses a burst into one callback
      and reports which file changed. {WatchModule} logs that path before each rebuild.
    </P>

    <H2>The rebuild loop</H2>
    <P>
      {WatchExport} owns the loop. A change that arrives while a build is already running is
      remembered and collapsed into a single follow-up rebuild, which waits for a short quiet period
      first so a flurry of saves settles into one run. A build that fails is logged and watching
      continues — the process does not exit on a build error. Press Ctrl+C to stop.
    </P>

    <Flow
      name="build-watch"
      desc="Developer runs the build in watch mode; a file change triggers a rebuild of the graph"
      priority="supplementary"
    >
      <Step node={BuildModule} label="starts the build in watch mode" />
      <Step node={WatchExport} label="runs the initial build, then begins watching" />
      <Step node={WatchPathsExport} label="reports a changed file once events settle" />
      <Step node={BuildExport} label="re-runs the full build pipeline" />
    </Flow>
  </Doc>
);
