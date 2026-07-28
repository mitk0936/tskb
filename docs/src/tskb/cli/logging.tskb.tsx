import { type External, Doc, H1, H2, P, List, Li, Snippet, Relation, ref } from "tskb";
import { createLogger } from "packages/tskb/src/log/index.js";

declare global {
  namespace tskb {
    interface Externals {
      debug: External<{
        desc: "Tiny namespaced logging library. Off by default, enabled per-namespace via the DEBUG env var (Node) or localStorage.debug (browser).";
        url: "https://www.npmjs.com/package/debug";
        kind: "package";
      }>;
    }
  }
}

const LogModule = ref as tskb.Modules["log"];
const CreateLogger = ref as tskb.Exports["log.createLogger"];
const Configure = ref as tskb.Exports["log.configure"];
const OutputModule = ref as tskb.Modules["cli.utils.logger"];
const IndexModule = ref as tskb.Modules["cli.index"];
const BuildModule = ref as tskb.Modules["cli.commands.build"];
const DebugExternal = ref as tskb.Externals["debug"];

export default (
  <Doc
    explains="How does tskb route log output across verbosity levels and streams?"
    priority="essential"
  >
    <H1>Logging</H1>
    <P>
      {LogModule} is the central logger for the Node side (CLI and core). It is built on{" "}
      {DebugExternal}. Each area gets its own logger from {CreateLogger} (for example,
      createLogger("cli:build") logs under tskb:cli:build). {Configure} runs once at startup in{" "}
      {IndexModule} to pick the level and enable the diagnostic namespaces.
    </P>
    <Relation from={IndexModule} to={LogModule} label="configures once at startup" />

    <H2>Two tiers</H2>
    <List>
      <Li>
        Normal output (always on): error, warn, and info are plain and undecorated. info goes to
        stdout — this is the lib's user-facing output, like the build progress and stats from{" "}
        {BuildModule}. warn and error go to stderr.
      </Li>
      <Li>
        The firehose (opt-in): debug and trace go through {DebugExternal} — namespaced
        (tskb:&lt;area&gt;) and colored, written to stderr. Off by default.
      </Li>
    </List>

    <H2>Using it</H2>
    <P>
      Each module makes one logger under its own namespace, then calls the level methods. info is
      the always-on user-facing output; debug/trace only show when the firehose is on:
    </P>
    <Snippet
      code={() => {
        const log = createLogger("cli:build");
        log.info("Found 3 documentation files"); // → stdout, always shown
        log.debug("resolved %d paths", 12); // → stderr firehose, only with --verbose / DEBUG
        const done = log.infoTime("Building graph"); // label on stdout, elapsed in the firehose
        done();
      }}
    />

    <H2>Turning on the firehose</H2>
    <List>
      <Li>--verbose enables every tskb namespace.</Li>
      <Li>
        DEBUG=tskb:cli:build (env var) enables one area; the browser explorer uses
        localStorage.debug or the ?debug= URL param.
      </Li>
      <Li>
        TSKB_LOG_LEVEL (browser: localStorage.tskb_log_level) sets the numeric level; enabling the
        firehose raises it so the extra output is actually shown.
      </Li>
    </List>

    <H2>The stdout rule</H2>
    <P>
      Query commands (search, pick, ls, context, docs, flows, registry) put only their result on
      stdout, through {OutputModule} (jsonOut / plainOut). They never call info, so their stdout
      stays pure, machine-readable data. Everything diagnostic — debug, trace, warnings, and errors
      — goes to stderr. Breaking this would corrupt piped output, so keep it.
    </P>

    <H2>Browser</H2>
    <P>
      The explorer SPA has its own logger with the same model: error, warn, and info go to the
      console, while debug and trace use the namespaced firehose. Toggle it with localStorage.debug
      (and localStorage.tskb_log_level), or pass ?debug= and ?log= on the URL.
    </P>
  </Doc>
);
