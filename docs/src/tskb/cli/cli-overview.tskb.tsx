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
  Relation,
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

      "cli.commands.watch": Module<{
        desc: "Watch mode for `tskb build` — rebuilds the graph when watched files change.";
        type: typeof import("packages/tskb/src/cli/commands/watch.js");
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
        desc: "Finds the `.tskb/graph/` directory for the current project.";
        type: typeof import("packages/tskb/src/cli/utils/graph-finder.js");
      }>;

      "cli.utils.graph-loader": Module<{
        desc: "Loads the split graph from `.tskb/graph/`, reading only the node types the caller needs.";
        type: typeof import("packages/tskb/src/cli/utils/graph-loader.js");
      }>;

      "cli.utils.watcher": Module<{
        desc: "Watches files and folders and reports changes after a short quiet period.";
        type: typeof import("packages/tskb/src/cli/utils/watcher.js");
      }>;

      "cli.utils.logger": Module<{
        desc: "Stdout output helpers for command results (JSON and plain text).";
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

      "cli.commands.watch.watch": Export<{
        desc: "Runs `tskb build` in watch mode: an initial build, then a rebuild on each change.";
        type: typeof import("packages/tskb/src/cli/commands/watch.js").watch;
      }>;

      "cli.utils.watcher.watchPaths": Export<{
        desc: "Watches one or more paths and calls back once per change, after changes settle.";
        type: typeof import("packages/tskb/src/cli/utils/watcher.js").watchPaths;
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

      "cli.utils.graph-loader.loadGraph": Export<{
        desc: "Reads the split graph from `.tskb/graph/`. Pass a list of node types to load only what you need.";
        type: typeof import("packages/tskb/src/cli/utils/graph-loader.js").loadGraph;
      }>;
    }

    interface Terms {
      globPattern: Term<"A file-matching pattern like `**/*.tskb.tsx`. Used to pick which doc files to build.">;
      tskbOutputDir: Term<"The `.tskb/` folder. Holds the build output: a `graph/` directory with per-type JSON files.">;
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
const WatchModule = ref as tskb.Modules["cli.commands.watch"];
const WatcherModule = ref as tskb.Modules["cli.utils.watcher"];
const SearchModule = ref as tskb.Modules["cli.commands.search"];
const PickModule = ref as tskb.Modules["cli.commands.pick"];
const LsModule = ref as tskb.Modules["cli.commands.ls"];
const InitModule = ref as tskb.Modules["cli.commands.init"];
const FlowsModule = ref as tskb.Modules["cli.commands.flows"];
const ContentBuilderModule = ref as tskb.Modules["cli.utils.content-builder"];
const SkillGenModule = ref as tskb.Modules["cli.utils.skill-generator"];
const CopilotGenModule = ref as tskb.Modules["cli.utils.copilot-instructions"];
const GraphFinderModule = ref as tskb.Modules["cli.utils.graph-finder"];
const GraphLoaderModule = ref as tskb.Modules["cli.utils.graph-loader"];
const LoadGraphExport = ref as tskb.Exports["cli.utils.graph-loader.loadGraph"];
const LoggerModule = ref as tskb.Modules["cli.utils.logger"];
const LogModule = ref as tskb.Modules["log"];
const ResolveNodeModule = ref as tskb.Modules["cli.utils.resolve-node"];
const ResolveNodeFn = ref as tskb.Exports["cli.utils.resolve-node.resolveNode"];

export default (
  <Doc explains="How is the tskb CLI organized into commands and utils?">
    <H1>CLI</H1>
    <P>
      {CliFolder} holds the command-line tool. {IndexModule} is the entry point: it parses arguments
      and routes to one command handler. Each command and util below carries its own{" "}
      <code>desc</code>— <code>pick</code> any of them for detail. This doc only shows how they
      group.
    </P>

    <H2>Commands</H2>
    <P>One file per command in {CommandsFolder}:</P>
    <List>
      <Li>{InitModule} scaffolds a new docs folder.</Li>
      <Li>{BuildModule} runs the full build pipeline.</Li>
      <Li>
        {SearchModule}, {PickModule}, {LsModule}, and {FlowsModule} are the read-only queries over a
        built graph.
      </Li>
    </List>
    <Relation from={BuildModule} to={WatchModule} label="hands its --watch flag off to" />

    <H2>Utils</H2>
    <P>Shared helpers in {UtilsFolder}, grouped by what they serve:</P>
    <List>
      <Li>
        <strong>Graph access</strong> — {GraphFinderModule} locates the graph directory,{" "}
        {GraphLoaderModule} ({LoadGraphExport}) loads only the node types a command asks for, and{" "}
        {ResolveNodeModule} ({ResolveNodeFn}) turns an ID or path into a node and walks its edges.
      </Li>
      <Li>
<<<<<<< HEAD
        <strong>Doc generation</strong> — {ContentBuilderModule} is the shared source of skill and
        instruction markdown.
=======
        {LoggerModule}: Stdout output helpers (jsonOut/plainOut) for command results — separate from
        logging, which lives in {LogModule}
>>>>>>> 3689aea (Initial Experimentation)
      </Li>
      <Li>
        <strong>Build support</strong> — {WatcherModule} reports settled file changes;{" "}
        {LoggerModule} routes CLI output.
      </Li>
    </List>
    <Relation from={ContentBuilderModule} to={SkillGenModule} label="provides skill markdown to" />
    <Relation
      from={ContentBuilderModule}
      to={CopilotGenModule}
      label="provides instruction markdown to"
    />
    <Relation from={WatcherModule} to={WatchModule} label="reports file changes to" />
  </Doc>
);
