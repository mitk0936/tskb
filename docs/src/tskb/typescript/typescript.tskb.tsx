import { type Module, type Export, Doc, H1, ref, P, H2, List, Li, Flow, Step } from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      "typescript.program": Module<{
        desc: "Creates TypeScript Program from files and tsconfig for static analysis";
        type: typeof import("packages/tskb/src/typescript/program.js");
      }>;

      "typescript.index": Module<{
        desc: "TypeScript module exports";
        type: typeof import("packages/tskb/src/typescript/index.js");
      }>;
    }

    interface Exports {
      "ts.createProgram": Export<{
        desc: "Creates a TypeScript Program for analyzing code structure, types, and symbols without emitting output";
        type: typeof import("packages/tskb/src/typescript/program.js").createProgram;
      }>;
    }
  }
}

const TypescriptFolder = ref as tskb.Folders["tskb.typescript"];
const ProgramModule = ref as tskb.Modules["typescript.program"];
const CreateProgramExport = ref as tskb.Exports["ts.createProgram"];
const TsProgramTerm = ref as tskb.Terms["tsProgram"];
const ExtractionRegistryModule = ref as tskb.Modules["extraction.registry"];
const ExtractionDocModule = ref as tskb.Modules["extraction.documentation"];
const GraphBuilderModule = ref as tskb.Modules["graph.builder"];

export default (
  <Doc
    explains="TypeScript Program creation for static analysis without compilation"
    priority="essential"
  >
    <H1>TypeScript Program</H1>
    <P>
      Located in {TypescriptFolder}. {ProgramModule} exports {CreateProgramExport} which creates a{" "}
      {TsProgramTerm} for analyzing code without compilation (noEmit=true).
    </P>
    <List>
      <Li>Reads and parses tsconfig.json for compiler options</Li>
      <Li>Validates TypeScript errors in specified files</Li>
      <Li>Returns Program with AST, type checker, and symbol resolution</Li>
    </List>

    <Flow
      name="static-analysis"
      desc="TypeScript Program creation through extraction to graph"
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
