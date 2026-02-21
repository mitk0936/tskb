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
      stdout clean for JSON results from query commands.
    </P>

    <H2>Design</H2>
    <List>
      <Li>All output goes to stderr via process.stderr.write — never stdout</Li>
      <Li>
        Configured once at startup in {IndexModule} via configure({"{ verbose }"}), driven by the
        --verbose CLI flag
      </Li>
      <Li>
        Four log functions: info() always prints, verbose() only when --verbose is set, error() for
        errors, time() prints a label then returns a closure that logs elapsed ms at verbose level
      </Li>
    </List>

    <H2>Verbosity</H2>
    <List>
      <Li>
        Default: {BuildModule} shows key stages and summary counts. Query commands produce JSON only
        on stdout, nothing on stderr
      </Li>
      <Li>
        --verbose: build adds timing per pipeline stage, path resolution stats, and file paths.
        Query commands log "Loaded graph from ..." on stderr
      </Li>
    </List>
  </Doc>
);
