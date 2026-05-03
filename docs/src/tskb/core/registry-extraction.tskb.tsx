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
        desc: "Reads registry and docs out of TypeScript source.";
        path: "packages/tskb/src/core/extraction";
      }>;
    }

    interface Modules {
      "extraction.registry": Module<{
        desc: "Reads Folders, Modules, Exports, and Terms from the registry types.";
        type: typeof import("packages/tskb/src/core/extraction/registry.js");
      }>;

      "extraction.module-morphology": Module<{
        desc: "Reads each module's exports and imports, with type stubs.";
        type: typeof import("packages/tskb/src/core/extraction/module-morphology.js");
      }>;
    }

    interface Exports {
      extractRegistry: Export<{
        desc: "Extracts the registry from TypeScript types.";
        type: typeof import("packages/tskb/src/core/extraction/registry.js").extractRegistry;
      }>;

      ExtractedRegistry: Export<{
        desc: "The registry data after extraction.";
        type: import("packages/tskb/src/core/extraction/registry.js").ExtractedRegistry;
      }>;

      extractModuleMorphology: Export<{
        desc: "Extracts a module's public exports and renders short code stubs for them.";
        type: typeof import("packages/tskb/src/core/extraction/module-morphology.js").extractModuleMorphology;
      }>;

      extractModuleImports: Export<{
        desc: "Extracts a module's import statements.";
        type: typeof import("packages/tskb/src/core/extraction/module-morphology.js").extractModuleImports;
      }>;
    }

    interface Terms {
      ast: Term<"Abstract Syntax Tree. TypeScript's tree shape of source code.">;
      declarationMerging: Term<"TypeScript's rule that merges declarations with the same name. Lets the registry be split across files.">;
      typeChecker: Term<"TypeScript's component that resolves types and gives type info for symbols.">;
      literalType: Term<"A type that represents one specific value, like the string `'hello'`. Used to read constants out of type definitions.">;
    }
  }
}

const ExtractRegistryExport = ref as tskb.Exports["extractRegistry"];
const MorphologyModule = ref as tskb.Modules["extraction.module-morphology"];
const ExtractMorphologyExport = ref as tskb.Exports["extractModuleMorphology"];
const ExtractImportsExport = ref as tskb.Exports["extractModuleImports"];
const BuildModuleNodes = ref as tskb.Modules["graph.builder"];

export default (
  <Doc explains="How does tskb extract Folders, Modules, Exports, and Terms from the TypeScript AST?">
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
