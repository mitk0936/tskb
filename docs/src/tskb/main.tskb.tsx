import { type Folder, type Module, type Export, Doc, H1, ref, P, H2, H3, Li, List } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "TSKB.Package.Root": Folder<{
        desc: "The root folder of the package, with its package.json and main npm README.md";
        path: "packages/tskb";
      }>;

      "tskb.cli": Folder<{ desc: "Source code for the cli"; path: "packages/tskb/src/cli" }>;
      "tskb.core": Folder<{
        desc: "Source code for the core - extraction logic for registry (TS interfaces used as a registry) and 'doc' processing <Doc>...</Doc>";
        path: "packages/tskb/src/core";
      }>;
      "tskb.runtime": Folder<{
        desc: "Source code for the runtime, the lib does not have an actual runtime, but this folder contains the base registry interfaces and jsx primitives";
        path: "packages/tskb/src/runtime";
      }>;
      "tskb.typescript": Folder<{
        desc: "Creates a TypeScript compiler Program from source files and tsconfig settings that enables static analysis of code structure, types, and symbols without emitting JavaScript output";
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
        desc: "The JSX runtime, provided by the package. Includes all available jsx tags in tskb as functions.";
        type: typeof import("packages/tskb/src/runtime/jsx.js");
      }>;

      "sample.tsconfig.json": Module<{
        desc: "An example of required tsconfig.json for building <TSKB> docs";
        type: typeof import("../../tsconfig.json");
      }>;
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
      ref: Export<{
        desc: "A placeholder for referencing anything from the global tskb registry into jsx documentation tags";
        type: typeof import("packages/tskb/src/index.js").ref;
      }>;

      "cli.build": Export<{
        desc: "The control flow function for the cli, building the docs, graph, and visualization outputing to the .tskb/ directory";
        type: typeof import("packages/tskb/src/cli/commands/build.js").build;
      }>;

      "cli.search": Export<{
        desc: "Fuzzy searches the entire knowledge graph for nodes matching a query, returning ranked results with scores across IDs, descriptions, and paths";
        type: typeof import("packages/tskb/src/cli/commands/search.js").search;
      }>;
      "cli.pick": Export<{
        desc: "Resolves any node by ID or filesystem path, returning type-specific data for folders, modules, exports, terms, and docs";
        type: typeof import("packages/tskb/src/cli/commands/pick.js").pick;
      }>;
      "cli.ls": Export<{
        desc: "Lists all folders in the knowledge graph from TSKB.Package.Root with controllable depth, returning flat JSON hierarchy";
        type: typeof import("packages/tskb/src/cli/commands/ls.js").ls;
      }>;
      generateDot: Export<{
        desc: "Core function that transforms the knowledge graph into DOT format";
        type: typeof import("packages/tskb/src/core/visualization/index.js").generateDot;
      }>;
    }
  }
}

const TSKBRootFolder = ref as tskb.Folders["TSKB.Package.Root"];
const PackageJson = ref as tskb.Modules["package.json"];
const CliTerm = ref as tskb.Terms["cli"];
const MainIndexModule = ref as tskb.Modules["Main.index.js"];
const JsxRuntimeTerm = ref as tskb.Terms["jsxRuntime"];
const JsxRuntimeModule = ref as tskb.Modules["Jsx.runtime.js"];
const FolderExport = ref as tskb.Exports["Folder"];
const ModuleExport = ref as tskb.Exports["Module"];
const ExportExport = ref as tskb.Exports["Export"];
const TermExport = ref as tskb.Exports["Term"];
const RefExport = ref as tskb.Exports["ref"];
const SampleTsconfigModule = ref as tskb.Modules["sample.tsconfig.json"];
const TsProgramTerm = ref as tskb.Terms["tsProgram"];
const RegistryTerm = ref as tskb.Terms["registry"];
const GraphTerm = ref as tskb.Terms["graph"];
const CliBuildExport = ref as tskb.Exports["cli.build"];
const GenerateDotExport = ref as tskb.Exports["generateDot"];
const DotFileTerm = ref as tskb.Terms["dotFile"];
const CliSearchExport = ref as tskb.Exports["cli.search"];
const CliPickExport = ref as tskb.Exports["cli.pick"];
const CliLsExport = ref as tskb.Exports["cli.ls"];
const SearchResultTerm = ref as tskb.Terms["searchResult"];

export default (
  <Doc
    explains="Architecture, API surface, and usage flow of the TSKB library"
    priority="essential"
  >
    <H1>Architecture and implementation docs for the {"<TSKB>"} library </H1>
    <P>
      The package is located in {TSKBRootFolder}, with its {PackageJson} and README.md for npm.
      IMPORTANT: The README.md is the official npm package doc, so we need to make sure its always
      updated after something important is added/changed
    </P>
    <H2>What is {"<TSKB>"}?</H2>
    <P>
      A TypeScript DSL for type-safe architectural documentation. Generates queryable knowledge
      graphs and diagrams with type-checked references.
    </P>
    <H3>What it provides in terms of interfaces (API's) and tools</H3>
    <P>
      In the root folder: {TSKBRootFolder}. In the
      {PackageJson} file, it declares a bin command named 'tskb' that runs the {CliTerm}
    </P>
    <P>
      The package exports two main modules, in addition to the {CliTerm}: the index module{" "}
      {MainIndexModule} and the jsxRuntime ({JsxRuntimeTerm}), defined in: {JsxRuntimeModule}
    </P>
    <H3>Core Primitives for Type-Safe Documentation</H3>
    <P>
      Main exports (primitives) of the library for creating type-safe architectural documentation:
      <List>
        <Li>
          {FolderExport}: Represents logical groupings in the codebase (features, layers, packages)
        </Li>
        <Li>{ModuleExport}: Represents concrete code units (classes, services, components)</Li>
        <Li>
          {ExportExport}: Creates type-safe references to actual code exports using TypeScript's
          typeof import() syntax - ensures documentation stays in sync with codebase
        </Li>
        <Li>{TermExport}: Represents domain concepts, patterns, or terminology</Li>
        <Li>
          {RefExport}: A placeholder for referencing anything from the global tskb registry into jsx
          tags with type assertions
        </Li>
      </List>
    </P>
    <P>
      Plus all the JSX documentation components exported from {JsxRuntimeModule}: Doc, H1, H2, H3,
      P, List, Li, Snippet - providing a familiar TSX syntax for structured content
    </P>
    <H3>A typical flow of usage</H3>
    <List>
      <Li>Create a docs folder in your repository for documentation files</Li>

      <Li>
        Define a tsconfig.json similar to {SampleTsconfigModule} pointing to repo root with jsx:
        "react-jsx" and jsxImportSource: "tskb"
      </Li>

      <Li>
        Declare vocabulary (Folders, Modules, Exports, Terms) using global namespace augmentation.
        Use typeof import() for type-safe references.
      </Li>

      <Li>
        Write *.tskb.tsx files using JSX components. TypeScript validates all references at compile
        time.
      </Li>

      <Li>
        Run {CliBuildExport}:<P>"tskb \"**/*.tskb.tsx\" --tsconfig tsconfig.json"</P>
      </Li>

      <Li>
        The {CliTerm} creates a {TsProgramTerm} and type-checks all documentation files against
        actual source code
      </Li>
      <Li>Extracts vocabulary from the {RegistryTerm} (Folders, Modules, Exports, Terms)</Li>
      <Li>Processes *.tskb.tsx files, extracting content and references</Li>
      <Li>Constructs the {GraphTerm} by analyzing relationships and hierarchies</Li>
      <Li>Outputs JSON knowledge graph optimized for AI agents and tooling</Li>
    </List>
    <P>Generating a visual representation:</P>
    <List>
      <Li>
        {CliBuildExport} automatically generates a {DotFileTerm} in .tskb/graph.dot using{" "}
        {GenerateDotExport}
      </Li>
      <Li>
        {GenerateDotExport} transforms the {GraphTerm} into a {DotFileTerm} with nodes and
        relationship edges
      </Li>
      <Li>Render with Graphviz: "dot -Tpng .tskb/graph.dot -o .tskb/graph.png"</Li>
      <Li>Or use interactive viewers like xdot or online Graphviz tools</Li>
    </List>
    <H3>Key Benefits</H3>
    <List>
      <Li>
        Type-checked references: Renames, moves, or API changes break the build - enforcing
        correctness
      </Li>
      <Li>Validated snippets: Code examples are type-checked against actual source</Li>
      <Li>Living documentation: Stays in sync through the compiler - CI catches drift</Li>
      <Li>AI-optimized: Queryable knowledge graph reduces hallucination</Li>
      <Li>Docs as infrastructure: Compile-time validation, not afterthought</Li>
    </List>
    <H3>Navigating the knowledge graph</H3>
    <P>Three commands for exploring and querying the knowledge graph - optimized for AI agents</P>
    <H3>List all folders</H3>
    <List>
      <Li>
        Run {CliLsExport}: "tskb ls ./dist/taskflow-graph.json" or "tskb ls
        ./dist/taskflow-graph.json --depth 2"
      </Li>
      <Li>Always starts from Package.Root, lists all folders hierarchically</Li>
      <Li>Controllable depth: default 1 (immediate children), -1 for unlimited</Li>
      <Li>Returns flat JSON with folder ID, depth level, description, and path</Li>
      <Li>Use for initial orientation and discovering folder IDs</Li>
    </List>
    <H3>Pick any node</H3>
    <List>
      <Li>
        Run {CliPickExport}: "tskb pick tskb.cli" (by ID) or "tskb pick packages/tskb/src/cli" (by
        path)
      </Li>
      <Li>Resolves any node type: folder, module, export, term, or doc</Li>
      <Li>Returns type-specific data: parent, children, modules, exports, referencing docs</Li>
      <Li>Falls back to nearest parent folder when no exact match is found</Li>
    </List>
    <H3>Search the graph</H3>
    <List>
      <Li>Run {CliSearchExport}: "tskb search auth" or "tskb search build command"</Li>
      <Li>Fuzzy searches the entire graph across IDs, descriptions, and paths using Fuse.js</Li>
      <Li>
        {SearchResultTerm} includes: top 10 ranked results with score (0-1, higher = better match)
      </Li>
      <Li>Searches across all node types: folders, modules, exports, terms, and docs</Li>
      <Li>Use pick to get full details on any result</Li>
    </List>
    <H3>Documentation Philosophy: Map, Not Manual</H3>
    <P>
      Write structural signposts showing what exists where and how pieces connect - not
      implementation details.
    </P>
    <List>
      <Li>Document structure: Declare folders, locations, and key relationships</Li>
      <Li>
        Use type-safe references: typeof import() ensures TypeScript validates existence and catches
        renames
      </Li>
      <Li>Focus on WHAT and WHERE, not HOW: Describe purpose and location, not algorithms</Li>
      <Li>Trust validation: TSKB catches broken references, not behavior changes</Li>
      <Li>Major relationships only: Document architectural connections, not every dependency</Li>
    </List>
  </Doc>
);
