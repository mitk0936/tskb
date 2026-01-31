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
        desc: "Command implementations for build, visualize, and select operations";
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

      "cli.commands.select": Module<{
        desc: "Select command module - finds single best-matching node with confidence score and context";
        type: typeof import("packages/tskb/src/cli/commands/select.js");
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
      commandRouting: Term<"The CLI's mechanism for parsing arguments and delegating to the appropriate command handler (build, visualize, or select)">;
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
const CliSelectModule = ref as tskb.Modules["cli.commands.select"];
const CliSelectExport = ref as tskb.Exports["cli.select"];
const SelectResultTerm = ref as tskb.Terms["selectResult"];

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

    <H2>Select Command</H2>

    <P>
      {CliSelectModule} ({CliSelectExport})
    </P>

    <List>
      <Li>Load graph JSON</Li>
      <Li>Support multi-word queries: "edge types", "select command", "confidence score"</Li>
      <Li>Match modes: exact phrase, prefix, phrase substring, all-words-present (any order)</Li>
      <Li>Score: exact phrase (boosted +15-20%), phrase substring, all words scattered</Li>
      <Li>Fields: node IDs, paths (resolvedPath/filePath), descs, content</Li>
      <Li>
        Confidence: exact=1.0, prefix=0.85, phrase+path=0.8, phrase=0.7, all-words=0.6,
        substring=0.5-0.65
      </Li>
      <Li>Return best match as {SelectResultTerm}: match, parent, children, docs, files</Li>
      <Li>Include suggestions when confidence {"<"} 0.7</Li>
      <Li>Concise (5 files, 100-char excerpts) or --verbose (15 files, 200-char excerpts)</Li>
    </List>
  </Doc>
);
