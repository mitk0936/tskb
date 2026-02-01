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
        desc: "Command implementations for build, visualize, select, and describe operations";
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
        desc: "Select command module - finds single best-matching node within a folder scope, with confidence score and context";
        type: typeof import("packages/tskb/src/cli/commands/select.js");
      }>;

      "cli.commands.describe": Module<{
        desc: "Describe command module - inspects folder structure and returns closest parent/children when path not found";
        type: typeof import("packages/tskb/src/cli/commands/describe.js");
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
      commandRouting: Term<"The CLI's mechanism for parsing arguments and delegating to the appropriate command handler (build, visualize, select, or describe)">;
      globPattern: Term<"File pattern syntax (e.g., '**/*.tskb.tsx') used to match documentation files for processing">;
    }
  }
}
