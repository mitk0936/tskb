import {
  type Folder,
  type Module,
  type Export,
  type Term,
  Doc,
  H1,
  H2,
  P,
  List,
  Li,
  ref,
} from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "tskb.cli.commands": Folder<{
        desc: "Command implementations for build, visualize, and query operations";
        path: "packages/tskb/src/cli/commands";
      }>;
    }

    interface Modules {
      "cli.index": Module<{
        desc: "CLI entry point - handles argument parsing, command routing, and error handling";
        type: typeof import("packages/tskb/src/cli/index.js");
      }>;

      "cli.commands.build": Module<{
        desc: "Build command module - orchestrates the complete pipeline from source files to knowledge graph JSON";
        type: typeof import("packages/tskb/src/cli/commands/build.js");
      }>;

      "cli.commands.visualize": Module<{
        desc: "Visualize command module - transforms knowledge graph JSON to Graphviz DOT format";
        type: typeof import("packages/tskb/src/cli/commands/visualize.js");
      }>;

      "cli.commands.query": Module<{
        desc: "Query command module - searches knowledge graph and returns structured results with context";
        type: typeof import("packages/tskb/src/cli/commands/query.js");
      }>;
    }

    interface Exports {
      "cli.build.ExtractConfig": Export<{
        desc: "Configuration interface for the build command containing pattern, output path, and tsconfig path";
        type: import("packages/tskb/src/cli/commands/build.js").ExtractConfig;
      }>;
    }

    interface Terms {
      cliPipeline: Term<"The six-stage build process: file discovery → program initialization → registry extraction → doc extraction → graph construction → JSON output">;
      commandRouting: Term<"The CLI's mechanism for parsing arguments and delegating to the appropriate command handler (build, visualize, or query)">;
      globPattern: Term<"File pattern syntax (e.g., '**/*.tskb.tsx') used to match documentation files for processing">;
    }
  }
}

// References to use in <Doc></Doc>
const CliIndexModule = ref as tskb.Modules["cli.index"];
const CommandRoutingTerm = ref as tskb.Terms["commandRouting"];
const CliCommandsFolder = ref as tskb.Folders["tskb.cli.commands"];
const CliBuildModule = ref as tskb.Modules["cli.commands.build"];
const CliBuildExport = ref as tskb.Exports["cli.build"];
const CliPipelineTerm = ref as tskb.Terms["cliPipeline"];
const GlobPatternTerm = ref as tskb.Terms["globPattern"];
const TsProgramTerm = ref as tskb.Terms["tsProgram"];
const RegistryTerm = ref as tskb.Terms["registry"];
const GraphTerm = ref as tskb.Terms["graph"];
const CliVisualizeModule = ref as tskb.Modules["cli.commands.visualize"];
const CliVisualizeExport = ref as tskb.Exports["cli.visualize"];
const GenerateDotExport = ref as tskb.Exports["generateDot"];
const DotFileTerm = ref as tskb.Terms["dotFile"];
const CliQueryModule = ref as tskb.Modules["cli.commands.query"];
const CliQueryExport = ref as tskb.Exports["cli.query"];
const QueryMatchTerm = ref as tskb.Terms["queryMatch"];

export default (
  <Doc>
    <H1>CLI Implementation</H1>

    <P>
      Entry: {CliIndexModule} - Command routing, arg parsing, error handling. Commands:{" "}
      {CliCommandsFolder}
    </P>

    <H2>Entry Point</H2>

    <P>
      {CliIndexModule} - {CommandRoutingTerm}
    </P>

    <List>
      <Li>Parses process.argv → command + args</Li>
      <Li>Validates required args, provides defaults (--out, --tsconfig)</Li>
      <Li>Backward compat: allows pattern without "build" prefix</Li>
      <Li>Routes to command handlers with typed configs</Li>
    </List>

    <H2>Build Command</H2>

    <P>
      {CliBuildModule} ({CliBuildExport}) - {CliPipelineTerm}
    </P>

    <List>
      <Li>File Discovery: {GlobPatternTerm} → .tskb.tsx files</Li>
      <Li>Program Init: Create {TsProgramTerm}</Li>
      <Li>Registry: Extract {RegistryTerm} from global namespace</Li>
      <Li>Docs: Parse JSX trees → content + refs</Li>
      <Li>Graph: Build {GraphTerm} nodes + edges</Li>
      <Li>Output: Write JSON</Li>
    </List>

    <H2>Visualize Command</H2>

    <P>
      {CliVisualizeModule} ({CliVisualizeExport})
    </P>

    <List>
      <Li>Read {GraphTerm} JSON</Li>
      <Li>
        Call {GenerateDotExport} → {DotFileTerm}
      </Li>
      <Li>Write DOT file</Li>
    </List>

    <H2>Query Command</H2>

    <P>
      {CliQueryModule} ({CliQueryExport})
    </P>

    <List>
      <Li>Load graph JSON</Li>
      <Li>Search: node IDs, paths, descs, content</Li>
      <Li>Score: ID=10, path=8, desc=5, content=3</Li>
      <Li>Build {QueryMatchTerm}: hierarchy, files, relationships, doc excerpts, AI suggestions</Li>
      <Li>Sort by score, output JSON</Li>
      <Li>
        Output modes: concise (default, ~5-10k tokens) or --verbose (full context, ~25k tokens)
      </Li>
    </List>
  </Doc>
);
