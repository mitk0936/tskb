import {
  type Module,
  type Export,
  type External,
  type Term,
  Doc,
  H1,
  ref,
  P,
  List,
  Li,
  Flow,
  Step,
  Relation,
} from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      "typescript.program": Module<{
        desc: "Builds the TypeScript Program tskb reads from.";
        type: typeof import("packages/tskb/src/core/typescript/program.js");
      }>;

      "typescript.index": Module<{
        desc: "Public entry for the TypeScript area.";
        type: typeof import("packages/tskb/src/core/typescript/index.js");
      }>;
    }

    interface Externals {
      typescript: External<{
        desc: "TypeScript compiler API (the 'typescript' npm package). Provides the AST, type checker, and symbol resolution used throughout registry extraction and documentation parsing.";
        url: "https://www.typescriptlang.org";
        kind: "npm-package";
      }>;
    }

    interface Exports {
      "ts.createProgram": Export<{
        desc: "Builds a TypeScript Program for static analysis. Does not emit output.";
        type: typeof import("packages/tskb/src/core/typescript/program.js").createProgram;
      }>;
    }

    interface Terms {
      tsProgram: Term<"A TypeScript compiler `Program` built from source files and a tsconfig. tskb uses it to read the AST, types, and symbols of your code — without emitting JavaScript.">;
    }
  }
}

const TypescriptExternal = ref as tskb.Externals["typescript"];
const CoreFolder = ref as tskb.Folders["tskb.core"];
const ProgramModule = ref as tskb.Modules["typescript.program"];
const CreateProgramExport = ref as tskb.Exports["ts.createProgram"];
const TsProgramTerm = ref as tskb.Terms["tsProgram"];
const ExtractionRegistryModule = ref as tskb.Modules["extraction.registry"];
const ExtractionDocModule = ref as tskb.Modules["extraction.documentation"];
const GraphBuilderModule = ref as tskb.Modules["graph.builder"];

export default (
  <Doc
    explains="How does tskb create a TypeScript Program for static analysis without compiling?"
    priority="essential"
  >
    <H1>TypeScript Program</H1>
    <P>
      Lives under {CoreFolder} as the typescript area. {ProgramModule} exports {CreateProgramExport}{" "}
      which creates a {TsProgramTerm} for analyzing code without compilation (noEmit=true).
    </P>
    <List>
      <Li>Reads and parses tsconfig.json for compiler options</Li>
      <Li>Validates TypeScript errors in specified files</Li>
      <Li>Returns Program with AST, type checker, and symbol resolution</Li>
    </List>

    <Relation from={ProgramModule} to={TypescriptExternal} label="wraps compiler API" />

    <Flow
      name="static-analysis"
      desc="`tskb build` invokes createProgram to set up TypeScript static analysis, then hands the Program to extraction and graph assembly"
      priority="essential"
    >
      <Step node={CreateProgramExport} label="creates Program from tsconfig + source files" />
      <Step
        node={ExtractionRegistryModule}
        label="walks AST for Folders, Modules, Terms, Exports"
      />
      <Step node={ExtractionDocModule} label="parses JSX trees for content and references" />
      <Step node={GraphBuilderModule} label="assembles nodes and edges into knowledge graph" />
    </Flow>
  </Doc>
);
