import {
  type Folder,
  type Module,
  type Export,
  type File,
  type External,
  type Term,
  Doc,
  H1,
  ref,
  P,
  Relation,
  Flow,
  Step,
} from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "TSKB.Package.Root": Folder<{
        desc: "The root folder of the package, with its package.json and main npm README.md";
        path: "packages/tskb";
        boundary: "TSKB main package";
      }>;

      "tskb.cli": Folder<{ desc: "The command-line interface."; path: "packages/tskb/src/cli" }>;
      "tskb.core": Folder<{
        desc: "Core build logic: registry extraction, doc extraction, graph assembly.";
        path: "packages/tskb/src/core";
      }>;
      "tskb.runtime": Folder<{
        desc: "Registry types and JSX primitives. No runtime code — these are the types and tags users import.";
        path: "packages/tskb/src/runtime";
      }>;
      "tskb.typescript": Folder<{
        desc: "Wraps the TypeScript compiler so tskb can read source code without compiling it.";
        path: "packages/tskb/src/typescript";
      }>;
    }

    interface Modules {
      "package.json": Module<{
        desc: "Library's package.json file";
        type: typeof import("../../../packages/tskb/package.json");
      }>;

      "Main.index.js": Module<{
        desc: "The main package export";
        type: typeof import("packages/tskb/src/index.js");
      }>;

      "Jsx.runtime.js": Module<{
        desc: "The JSX runtime — every tskb JSX tag (Doc, P, Flow, etc.) is a function exported here.";
        type: typeof import("packages/tskb/src/runtime/jsx.js");
      }>;

      "sample.tsconfig.json": Module<{
        desc: "An example of required tsconfig.json for building <TSKB> docs";
        type: typeof import("../../tsconfig.json");
      }>;
    }

    interface Externals {
      npm: External<{
        desc: "npm package registry where tskb is published. The package includes the CLI binary, library entry point, JSX runtime, and pre-built explorer SPA assets.";
        url: "https://www.npmjs.com/package/tskb";
        kind: "package-registry";
      }>;
    }

    interface Files {
      "npm.README.md": File<{
        desc: "The main npm README.md for the tskb package";
        path: "packages/tskb/README.md";
      }>;
    }

    interface Terms {
      library: Term<"The tskb package itself — its CLI, JSX runtime, and types for writing docs.">;
      cli: Term<"The command-line tool shipped by the package. Run as `tskb` after install. Builds the graph, runs queries, opens the explorer.">;
      jsxRuntime: Term<'A custom JSX runtime that turns .tskb.tsx files into a knowledge graph instead of DOM. Picked up by the docs tsconfig via `jsxImportSource: "tskb"`.'>;
      registry: Term<"The global `namespace tskb` where Folders, Modules, Exports, and Terms are declared. All .tskb.tsx files share one registry — declarations merge across files.">;
      graph: Term<"The JSON output of the build: every node (folder, module, export, term, doc, flow) and the edges between them. Saved to `.tskb/graph.json`.">;
    }

    interface Exports {
      Folder: Export<{
        desc: "A generic helper to reference folders inside doc files";
        type: import("packages/tskb/src/runtime/registry.js").Folder<any>;
      }>;
      Module: Export<{
        desc: "A generic helper to reference modules inside doc files";
        type: import("packages/tskb/src/runtime/registry.js").Module<any>;
      }>;
      Export: Export<{
        desc: "A generic helper to reference exports inside doc files";
        type: import("packages/tskb/src/runtime/registry.js").Export<any>;
      }>;
      Term: Export<{
        desc: "A generic helper to reference terms inside doc files";
        type: import("packages/tskb/src/runtime/registry.js").Term<any>;
      }>;
      File: Export<{
        desc: "A generic helper to reference non-JS/TS files (README.md, yml configs, etc.) inside doc files";
        type: import("packages/tskb/src/runtime/registry.js").File<any>;
      }>;
      ref: Export<{
        desc: "A placeholder for referencing anything from the global tskb registry into jsx documentation tags";
        type: typeof import("packages/tskb/src/index.js").ref;
      }>;

      "cli.build": Export<{
        desc: "Builds the knowledge graph from .tskb.tsx sources.";
        type: typeof import("packages/tskb/src/cli/commands/build.js").build;
      }>;

      "cli.search": Export<{
        desc: "Searches the graph and returns ranked matches.";
        type: typeof import("packages/tskb/src/cli/commands/search.js").search;
      }>;
      "cli.pick": Export<{
        desc: "Returns full details for one node, by ID or path.";
        type: typeof import("packages/tskb/src/cli/commands/pick.js").pick;
      }>;
      "cli.ls": Export<{
        desc: "Lists folders in the graph as a hierarchy.";
        type: typeof import("packages/tskb/src/cli/commands/ls.js").ls;
      }>;
      generateDot: Export<{
        desc: "Renders the graph as a Graphviz DOT file.";
        type: typeof import("packages/tskb/src/core/visualization/index.js").generateDot;
      }>;
    }
  }
}

const NpmExternal = ref as tskb.Externals["npm"];
const TSKBRootFolder = ref as tskb.Folders["TSKB.Package.Root"];
const NpmReadme = ref as tskb.Files["npm.README.md"];
const PackageJson = ref as tskb.Modules["package.json"];
const CliTerm = ref as tskb.Terms["cli"];
const MainIndexModule = ref as tskb.Modules["Main.index.js"];
const JsxRuntimeTerm = ref as tskb.Terms["jsxRuntime"];
const JsxRuntimeModule = ref as tskb.Modules["Jsx.runtime.js"];
const CliBuildExport = ref as tskb.Exports["cli.build"];
const ExtractRegistryExport = ref as tskb.Exports["extractRegistry"];
const ExtractDocsExport = ref as tskb.Exports["extractDocs"];
const BuildGraphExport = ref as tskb.Exports["buildGraph"];
const GenerateDotExport = ref as tskb.Exports["generateDot"];

export default (
  <Doc explains="What is tskb and what does this package contain?" priority="essential">
    <H1>tskb</H1>
    <P>
      A TypeScript DSL for type-safe architectural documentation. {TSKBRootFolder} contains the
      library, CLI, and pre-built explorer SPA. Its {PackageJson} declares a <code>tskb</code> bin
      that runs the {CliTerm}, and {NpmReadme} is the public-facing readme.
    </P>
    <Relation from={TSKBRootFolder} to={NpmExternal} label="published to" />
    <P>
      Two main entry modules sit alongside the {CliTerm}: {MainIndexModule} (the library API) and
      {JsxRuntimeModule} (the JSX runtime, {JsxRuntimeTerm}).
    </P>
    <Flow
      name="build-pipeline"
      desc="The tskb build process: source files through extraction to knowledge graph outputs"
      priority="essential"
    >
      <Step
        node={CliBuildExport}
        label="Orchestrates the pipeline: file discovery, extraction, graph building, output generation"
      />
      <Step
        node={ExtractRegistryExport}
        label="Scans TypeScript AST for global tskb namespace declarations (Folders, Modules, Exports, Terms)"
      />
      <Step
        node={ExtractDocsExport}
        label="Receives completed registry; traverses JSX trees to extract content, references, relations, and flows — embeds data-node-display in reference links using registry-resolved paths"
      />
      <Step
        node={BuildGraphExport}
        label="Merges registry and docs into a unified graph with nodes, edges, and hierarchy"
      />
      <Step
        node={GenerateDotExport}
        label="Transforms the graph into DOT format for Graphviz visualization"
      />
    </Flow>
  </Doc>
);
