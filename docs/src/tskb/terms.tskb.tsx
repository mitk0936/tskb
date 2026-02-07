import { type Term } from "tskb";

declare global {
  namespace tskb {
    interface Terms {
      library: Term<"Refers to the <TSKB> package with all of its capabilities, interfaces and commands">;
      cli: Term<"The library exposes a command line interface for main actions - build docs to json graph, generate visualization, select nodes from the graph by search term">;
      jsxRuntime: Term<"TSKB provides a custom JSX runtime (jsx-runtime module) that transforms TSX documentation syntax into a knowledge graph. Configured via tsconfig's jsxImportSource option, it processes JSX elements differently from React - instead of DOM rendering, it extracts documentation structure, references, and code snippets for analysis and visualization.">;
      tsProgram: Term<"TypeScript compiler Program from source files and tsconfig settings that enables static analysis of code structure, types, and symbols without emitting JavaScript output.">;
      registry: Term<"The global namespace (declare global { namespace tskb }) containing typed interfaces (Folders, Modules, Exports, Terms) that serve as a type-safe vocabulary registry, enabling autocomplete and type-checked references across all .tskb.tsx documentation files.">;
      graph: Term<"Refers to th raw output of the library, where it constructs all the relations and connections between folders, modules, exports, terms, docs, etc. In its raw form it is a json file">;
      dotFile: Term<"A Graphviz DOT format file that describes the graph structure with nodes and edges, used for rendering visual diagrams of the architecture">;
      selectResult: Term<"Result from selecting a node in the knowledge graph - includes the best match with confidence score, parent/children context, related docs and files, and alternative suggestions when match confidence is low">;
    }
  }
}
