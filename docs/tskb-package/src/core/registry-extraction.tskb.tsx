import { type Folder, type Module, type Export, type Term } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "core.extraction": Folder<{
        desc: "Contains the logic for extracting registry and documentation from TypeScript AST";
        path: "packages/tskb/src/core/extraction";
      }>;
    }

    interface Modules {
      "extraction.registry": Module<{
        desc: "Main registry extraction module that traverses TypeScript AST to extract Folders, Modules, Terms, and Exports from the global tskb namespace";
        type: typeof import("packages/tskb/src/core/extraction/registry.js");
      }>;
    }

    interface Exports {
      extractRegistry: Export<{
        desc: "Main function that extracts the vocabulary (Folders, Modules, Terms, Exports) from TypeScript's type system using the compiler API";
        type: typeof import("packages/tskb/src/core/extraction/registry.js").extractRegistry;
      }>;

      ExtractedRegistry: Export<{
        desc: "Type definition for the registry data structure containing Maps of folders, modules, terms, and exports";
        type: import("packages/tskb/src/core/extraction/registry.js").ExtractedRegistry;
      }>;
    }

    interface Terms {
      ast: Term<"Abstract Syntax Tree - TypeScript's tree representation of source code, used by the compiler API to analyze code structure">;
      declarationMerging: Term<"TypeScript feature that allows multiple declarations with the same name to be merged into a single definition, enabling distributed vocabulary across files">;
      typeChecker: Term<"TypeScript compiler component that resolves types, validates code, and provides type information for symbols in the AST">;
      literalType: Term<"A TypeScript type that represents a specific literal value (e.g., string literal 'hello' or number literal 42), used to extract constant values from type definitions">;
    }
  }
}
