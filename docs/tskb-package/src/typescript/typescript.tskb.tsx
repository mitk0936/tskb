import { type Module, type Export, Doc, H1, ref, P, H2, List, Li } from "tskb";

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

export default (
  <Doc>
    <H1>TypeScript Program</H1>
    <P>
      Located in {TypescriptFolder}. Creates {TsProgramTerm} for analyzing code without compilation.
    </P>

    <H2>Key Module</H2>
    <P>
      {ProgramModule}: Exports {CreateProgramExport} which:
    </P>
    <List>
      <Li>Reads and parses tsconfig.json for compiler options</Li>
      <Li>Creates TypeScript Program with noEmit=true (analysis only)</Li>
      <Li>Validates TypeScript errors in specified files</Li>
      <Li>Returns Program with AST, type checker, and symbol resolution</Li>
    </List>

    <H2>Purpose</H2>
    <P>
      Provides the {TsProgramTerm} used by extraction logic to parse *.tskb.tsx files, resolve
      types, and walk ASTs for registry and documentation extraction.
    </P>
  </Doc>
);
