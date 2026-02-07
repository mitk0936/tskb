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
        desc: "Command implementations for build, select, describe, and ls operations";
        path: "packages/tskb/src/cli/commands";
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

      "cli.commands.select": Module<{
        desc: "Select command module - finds single best-matching node within a folder scope using folder IDs, with confidence score and context";
        type: typeof import("packages/tskb/src/cli/commands/select.js");
      }>;

      "cli.commands.describe": Module<{
        desc: "Describe command module - inspects folder structure by folder ID, returning parent, children, modules, exports, and docs";
        type: typeof import("packages/tskb/src/cli/commands/describe.js");
      }>;

      "cli.commands.ls": Module<{
        desc: "List command module - recursively lists all folders from root with controllable depth, returning flat JSON hierarchy";
        type: typeof import("packages/tskb/src/cli/commands/ls.js");
      }>;
    }

    interface Exports {
      "cli.build.ExtractConfig": Export<{
        desc: "Configuration interface for the build command containing glob pattern and tsconfig path";
        type: import("packages/tskb/src/cli/commands/build.js").ExtractConfig;
      }>;
    }

    interface Terms {
      cliPipeline: Term<"The build process: file discovery → program initialization → registry extraction → doc extraction → graph construction → output generation (JSON, DOT, AGENTS.md)">;
      commandRouting: Term<"The CLI's mechanism for parsing arguments and delegating to the appropriate command handler (build, select, describe, or ls)">;
      globPattern: Term<"File pattern syntax (e.g., '**/*.tskb.tsx') used to match documentation files for processing">;
      folderIdNavigation: Term<"Navigation strategy using folder IDs from the knowledge graph registry (e.g., 'tskb.cli', 'Package.Root') instead of filesystem paths">;
      tskbOutputDir: Term<"The .tskb/ directory containing all build outputs: graph.json, graph.dot, and AGENTS.md">;
    }
  }
}
