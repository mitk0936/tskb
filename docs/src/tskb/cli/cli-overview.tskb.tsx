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
        desc: "One file per CLI command.";
        path: "packages/tskb/src/cli/commands";
      }>;

      "tskb.cli.utils": Folder<{
        desc: "Shared helpers for CLI commands.";
        path: "packages/tskb/src/cli/utils";
      }>;
    }

    interface Modules {
      "cli.index": Module<{
        desc: "CLI entry point. Routes arguments to a command.";
        type: typeof import("packages/tskb/src/cli/index.js");
      }>;

      "cli.commands.build": Module<{
        desc: "The `tskb build` command.";
        type: typeof import("packages/tskb/src/cli/commands/build.js");
      }>;

      "cli.commands.search": Module<{
        desc: "The `tskb search` command.";
        type: typeof import("packages/tskb/src/cli/commands/search.js");
      }>;

      "cli.commands.pick": Module<{
        desc: "The `tskb pick` command.";
        type: typeof import("packages/tskb/src/cli/commands/pick.js");
      }>;

      "cli.commands.ls": Module<{
        desc: "The `tskb ls` command.";
        type: typeof import("packages/tskb/src/cli/commands/ls.js");
      }>;

      "cli.commands.init": Module<{
        desc: "The `tskb init` command. Scaffolds a new docs folder.";
        type: typeof import("packages/tskb/src/cli/commands/init.js");
      }>;

      "cli.commands.flows": Module<{
        desc: "The `tskb flows` command.";
        type: typeof import("packages/tskb/src/cli/commands/flows.js");
      }>;

      "cli.utils.content-builder": Module<{
        desc: "Shared markdown content for the generated skill and instructions files.";
        type: typeof import("packages/tskb/src/cli/utils/content-builder.js");
      }>;

      "cli.utils.skill-generator": Module<{
        desc: "Writes the Claude Code skill files for tskb.";
        type: typeof import("packages/tskb/src/cli/utils/skill-generator.js");
      }>;

      "cli.utils.copilot-instructions": Module<{
        desc: "Writes the Copilot instructions files for tskb.";
        type: typeof import("packages/tskb/src/cli/utils/copilot-instructions-generator.js");
      }>;

      "cli.utils.graph-finder": Module<{
        desc: "Finds the `.tskb/graph.json` file for the current project.";
        type: typeof import("packages/tskb/src/cli/utils/graph-finder.js");
      }>;

      "cli.utils.logger": Module<{
        desc: "Logger for CLI output.";
        type: typeof import("packages/tskb/src/cli/utils/logger.js");
      }>;

      "cli.utils.resolve-node": Module<{
        desc: "Resolves an identifier (ID or path) to a graph node and helps walk its edges.";
        type: typeof import("packages/tskb/src/cli/utils/resolve-node.js");
      }>;
    }

    interface Exports {
      "cli.build.ExtractConfig": Export<{
        desc: "Config the build command takes: glob pattern and tsconfig path.";
        type: import("packages/tskb/src/cli/commands/build.js").ExtractConfig;
      }>;

      "cli.utils.resolve-node.resolveNode": Export<{
        desc: "Resolves an ID or path to a node in the graph.";
        type: typeof import("packages/tskb/src/cli/utils/resolve-node.js").resolveNode;
      }>;

      "cli.utils.resolve-node.getNodeEdges": Export<{
        desc: "Returns a node's incoming and outgoing edges.";
        type: typeof import("packages/tskb/src/cli/utils/resolve-node.js").getNodeEdges;
      }>;

      "cli.utils.resolve-node.findReferencingDocs": Export<{
        desc: "Returns the docs that reference a given node.";
        type: typeof import("packages/tskb/src/cli/utils/resolve-node.js").findReferencingDocs;
      }>;

      "cli.utils.resolve-node.findParent": Export<{
        desc: "Returns the parent folder or module of a node.";
        type: typeof import("packages/tskb/src/cli/utils/resolve-node.js").findParent;
      }>;

      "cli.utils.resolve-node.findAllNodesById": Export<{
        desc: "Finds every node sharing the same ID across types.";
        type: typeof import("packages/tskb/src/cli/utils/resolve-node.js").findAllNodesById;
      }>;
    }

    interface Terms {
      globPattern: Term<"A file-matching pattern like `**/*.tskb.tsx`. Used to pick which doc files to build.">;
      tskbOutputDir: Term<"The `.tskb/` folder. Holds the build output: `graph.json` and `graph.dot`.">;
      searchResult: Term<"A match returned by `tskb search`. A node plus a score from 0 to 1; higher means a better match.">;
      resolvedVia: Term<"How `resolveNode` found a match: by exact ID, by path, or by walking up to the nearest parent folder.">;
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
const InitModule = ref as tskb.Modules["cli.commands.init"];
const FlowsModule = ref as tskb.Modules["cli.commands.flows"];
const ContentBuilderModule = ref as tskb.Modules["cli.utils.content-builder"];
const SkillGenModule = ref as tskb.Modules["cli.utils.skill-generator"];
const CopilotGenModule = ref as tskb.Modules["cli.utils.copilot-instructions"];
const GraphFinderModule = ref as tskb.Modules["cli.utils.graph-finder"];
const LoggerModule = ref as tskb.Modules["cli.utils.logger"];
const ResolveNodeModule = ref as tskb.Modules["cli.utils.resolve-node"];
const ResolveNodeFn = ref as tskb.Exports["cli.utils.resolve-node.resolveNode"];

export default (
  <Doc explains="CLI structure: commands (init, build, search, pick, context, ls, docs, flows) and utils (output generators, content builder, logger)">
    <H1>CLI</H1>
    <P>
      Located in {CliFolder}. Entry point: {IndexModule} — parses arguments, routes to command
      handlers.
    </P>

    <H2>Commands</H2>
    <P>In {CommandsFolder}:</P>
    <List>
      <Li>
        {InitModule}: Interactive scaffolder — creates docs folder, tsconfig, starter doc, build
        script
      </Li>
      <Li>
        {BuildModule}: Full pipeline — files → TypeScript program → extraction → graph → outputs
      </Li>
      <Li>{SearchModule}: Fuzzy search across all node types, returns ranked JSON results</Li>
      <Li>{PickModule}: Resolve any node by ID or path, returns type-specific context</Li>
      <Li>{LsModule}: List folder hierarchy with depth control, includes essential docs</Li>
      <Li>
        {FlowsModule}: List or search flows sorted by priority (constraint → essential →
        supplementary)
      </Li>
    </List>

    <H2>Utils</H2>
    <P>In {UtilsFolder}:</P>
    <List>
      <Li>
        {ContentBuilderModule}: Produces two markdown bodies — query body and update body (syntax +
        session triggers) — consumed by skill and instructions generators
      </Li>
      <Li>{SkillGenModule}: Generates two Claude Code skills — tskb and tskb-update</Li>
      <Li>{CopilotGenModule}: Generates two Copilot instructions — tskb and tskb-update</Li>
      <Li>{GraphFinderModule}: Finds .tskb/graph.json from cwd, used by search/pick/ls</Li>
      <Li>
        {LoggerModule}: Stderr-only logger with info/verbose/error/time — configured once at startup
        via --verbose flag
      </Li>
      <Li>
        {ResolveNodeModule}: Resolves any identifier to a graph node via {ResolveNodeFn} (exact ID →
        path → nearest parent folder). Also provides edge helpers: getNodeEdges,
        findReferencingDocs, findParent, findAllNodesById.
      </Li>
    </List>
  </Doc>
);
