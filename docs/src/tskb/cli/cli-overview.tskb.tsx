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
        desc: "Command implementations for build, search, pick, and ls operations";
        path: "packages/tskb/src/cli/commands";
      }>;

      "tskb.cli.utils": Folder<{
        desc: "CLI utilities - output generators (skill, copilot instructions), shared content builder, graph file finder";
        path: "packages/tskb/src/cli/utils";
      }>;
    }

    interface Modules {
      "cli.index": Module<{
        desc: "CLI entry point - handles argument parsing, command routing, and error handling";
        type: typeof import("packages/tskb/src/cli/index.js");
      }>;

      "cli.commands.build": Module<{
        desc: "Build command module - orchestrates the complete pipeline from source files to knowledge graph, DOT visualization, and agent guidance";
        type: typeof import("packages/tskb/src/cli/commands/build.js");
      }>;

      "cli.commands.search": Module<{
        desc: "Search command module - fuzzy searches the entire knowledge graph for nodes matching a query, returning ranked results";
        type: typeof import("packages/tskb/src/cli/commands/search.js");
      }>;

      "cli.commands.pick": Module<{
        desc: "Pick command module - resolves any node by ID or filesystem path, returning type-specific data for folders, modules, exports, terms, and docs";
        type: typeof import("packages/tskb/src/cli/commands/pick.js");
      }>;

      "cli.commands.ls": Module<{
        desc: "List command module - recursively lists all folders from root with controllable depth, returning flat JSON hierarchy";
        type: typeof import("packages/tskb/src/cli/commands/ls.js");
      }>;

      "cli.utils.content-builder": Module<{
        desc: "Shared markdown content builder - produces query body (commands, response shapes, folder tree, docs, constraints, workflow) and update body (authoring philosophy, primitives, examples, best practices)";
        type: typeof import("packages/tskb/src/cli/utils/content-builder.js");
      }>;

      "cli.utils.skill-generator": Module<{
        desc: "Generates two Claude Code skills: .claude/skills/tskb/SKILL.md (query/explore) and .claude/skills/tskb-update/SKILL.md (doc authoring guide)";
        type: typeof import("packages/tskb/src/cli/utils/skill-generator.js");
      }>;

      "cli.utils.copilot-instructions": Module<{
        desc: "Generates two Copilot instructions files: tskb.instructions.md (query/explore) and tskb-update.instructions.md (doc authoring guide)";
        type: typeof import("packages/tskb/src/cli/utils/copilot-instructions-generator.js");
      }>;

      "cli.utils.graph-finder": Module<{
        desc: "Locates .tskb/graph.json from the current working directory, used by search/pick/ls commands";
        type: typeof import("packages/tskb/src/cli/utils/graph-finder.js");
      }>;

      "cli.utils.logger": Module<{
        desc: "CLI logger — all output to stderr, supports verbosity levels and timing. Configured once at startup via configure({ verbose })";
        type: typeof import("packages/tskb/src/cli/utils/logger.js");
      }>;
    }

    interface Exports {
      "cli.build.ExtractConfig": Export<{
        desc: "Configuration interface for the build command containing glob pattern and tsconfig path";
        type: import("packages/tskb/src/cli/commands/build.js").ExtractConfig;
      }>;
    }

    interface Terms {
      cliPipeline: Term<"The build process: file discovery → program initialization → registry extraction → doc extraction → graph construction → output generation (JSON, DOT, skill/instructions)">;
      commandRouting: Term<"The CLI's mechanism for parsing arguments and delegating to the appropriate command handler (build, search, pick, or ls)">;
      globPattern: Term<"File pattern syntax (e.g., '**/*.tskb.tsx') used to match documentation files for processing">;
      folderIdNavigation: Term<"Navigation strategy using folder IDs from the knowledge graph registry (e.g., 'tskb.cli', 'Package.Root') instead of filesystem paths">;
      tskbOutputDir: Term<"The .tskb/ directory containing all build outputs: graph.json and graph.dot">;
    }
  }
}

const CliFolder = ref as tskb.Folders["tskb.cli"];
const CommandsFolder = ref as tskb.Folders["tskb.cli.commands"];
const UtilsFolder = ref as tskb.Folders["tskb.cli.utils"];
const IndexModule = ref as tskb.Modules["cli.index"];
const BuildModule = ref as tskb.Modules["cli.commands.build"];
const SearchModule = ref as tskb.Modules["cli.commands.search"];
const PickModule = ref as tskb.Modules["cli.commands.pick"];
const LsModule = ref as tskb.Modules["cli.commands.ls"];
const ContentBuilderModule = ref as tskb.Modules["cli.utils.content-builder"];
const SkillGenModule = ref as tskb.Modules["cli.utils.skill-generator"];
const CopilotGenModule = ref as tskb.Modules["cli.utils.copilot-instructions"];
const GraphFinderModule = ref as tskb.Modules["cli.utils.graph-finder"];
const LoggerModule = ref as tskb.Modules["cli.utils.logger"];

export default (
  <Doc explains="CLI structure: commands (build, search, pick, ls) and utils (output generators, content builder, logger)">
    <H1>CLI</H1>
    <P>
      Located in {CliFolder}. Entry point: {IndexModule} — parses arguments, routes to command
      handlers.
    </P>

    <H2>Commands</H2>
    <P>In {CommandsFolder}:</P>
    <List>
      <Li>
        {BuildModule}: Full pipeline — files → TypeScript program → extraction → graph → outputs
      </Li>
      <Li>{SearchModule}: Fuzzy search across all node types, returns ranked JSON results</Li>
      <Li>{PickModule}: Resolve any node by ID or path, returns type-specific context</Li>
      <Li>{LsModule}: List folder hierarchy with depth control, includes essential docs</Li>
    </List>

    <H2>Utils</H2>
    <P>In {UtilsFolder}:</P>
    <List>
      <Li>
        {ContentBuilderModule}: Produces two markdown bodies — query body (commands, response
        shapes, folder tree, docs, constraints, workflow) and update body (authoring philosophy,
        primitives, examples, best practices)
      </Li>
      <Li>
        {SkillGenModule}: Generates two Claude Code skills — tskb (query/explore) and tskb-update
        (doc authoring guide)
      </Li>
      <Li>
        {CopilotGenModule}: Generates two Copilot instructions files — tskb (query/explore) and
        tskb-update (doc authoring guide)
      </Li>
      <Li>{GraphFinderModule}: Finds .tskb/graph.json from cwd, used by search/pick/ls</Li>
      <Li>
        {LoggerModule}: Stderr-only logger with info/verbose/error/time — configured once at startup
        via --verbose flag
      </Li>
    </List>
  </Doc>
);
