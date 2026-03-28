import {
  type Folder,
  type Module,
  type Export,
  type Term,
  Doc,
  H1,
  P,
  Flow,
  Step,
  ref,
} from "tskb";

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

      "extraction.module-morphology": Module<{
        desc: "Extracts public API shape from TypeScript modules — exports, imports, type stubs, and line ranges using the type checker";
        type: typeof import("packages/tskb/src/core/extraction/module-morphology.js");
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

      extractModuleMorphology: Export<{
        desc: "Resolves a module's source file and extracts its export surface — classifies each export by kind (function, class, interface, type, enum, variable) and renders a code stub with line ranges";
        type: typeof import("packages/tskb/src/core/extraction/module-morphology.js").extractModuleMorphology;
      }>;

      extractModuleImports: Export<{
        desc: "Walks import declarations in a module's AST to extract symbol names, paths, and display strings";
        type: typeof import("packages/tskb/src/core/extraction/module-morphology.js").extractModuleImports;
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

const ExtractRegistryExport = ref as tskb.Exports["extractRegistry"];
const MorphologyModule = ref as tskb.Modules["extraction.module-morphology"];
const ExtractMorphologyExport = ref as tskb.Exports["extractModuleMorphology"];
const ExtractImportsExport = ref as tskb.Exports["extractModuleImports"];
const BuildModuleNodes = ref as tskb.Modules["graph.builder"];

export default (
  <Doc explains="Registry extraction: how TypeScript AST is traversed to extract Folders, Modules, Terms, Exports, and module morphology">
    <H1>Registry Extraction</H1>
    <P>
      {ExtractRegistryExport} walks the TypeScript AST for registry declarations, then enriches each
      module with its public API shape via {MorphologyModule}.
    </P>

    <Flow
      name="module-morphology-extraction"
      desc="How a Module declaration becomes a fully enriched graph node with exports, imports, and type stubs"
      priority="essential"
    >
      <Step node={ExtractRegistryExport} label="collects Module declarations from tskb namespace" />
      <Step
        node={ExtractMorphologyExport}
        label="resolves source file, classifies exports, renders code stubs"
      />
      <Step node={ExtractImportsExport} label="walks import declarations for symbols and paths" />
      <Step node={BuildModuleNodes} label="assembles enriched ModuleNode with edges" />
    </Flow>
  </Doc>
);
