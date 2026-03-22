import { Doc, H1, H2, P, List, Li, ref } from "tskb";

const LoggerModule = ref as tskb.Modules["cli.utils.logger"];
const IndexModule = ref as tskb.Modules["cli.index"];
const BuildModule = ref as tskb.Modules["cli.commands.build"];

export default (
  <Doc
    explains="CLI logging: stderr-only output, --verbose flag, timing support"
    priority="essential"
  >
    <H1>CLI Logger</H1>
    <P>
      {LoggerModule} is a module-level singleton that routes all CLI output to stderr, keeping
      stdout clean for query command results.
    </P>

    <H2>Design</H2>
    <List>
      <Li>All log output goes to stderr via process.stderr.write — never stdout</Li>
      <Li>
        Configured once at startup in {IndexModule} via configure({"{ verbose }"}), driven by the
        --verbose CLI flag
      </Li>
      <Li>
        Log functions: info() always prints, verbose() only when --verbose is set, error() for
        errors, time() prints a label then returns a closure that logs elapsed ms at verbose level
      </Li>
    </List>

    <H2>Output Modes</H2>
    <P>Query commands (search, pick, context, ls, docs) support three output modes on stdout:</P>
    <List>
      <Li>Default: pretty-printed JSON (human-readable)</Li>
      <Li>--optimized: compact JSON (no whitespace, smaller payload)</Li>
      <Li>
        --plain: structured plain text optimized for AI assistants — no JSON overhead, ~30% fewer
        tokens while preserving all semantic content. Uses plainOut() in the logger
      </Li>
    </List>

    <H2>Verbosity</H2>
    <List>
      <Li>
        Default: {BuildModule} shows key stages and summary counts. Query commands produce output
        only on stdout, nothing on stderr
      </Li>
      <Li>
        --verbose: build adds timing per pipeline stage, path resolution stats, and file paths.
        Query commands log "Loaded graph from ..." on stderr
      </Li>
    </List>
  </Doc>
);
