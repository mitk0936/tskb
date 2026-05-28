import { Doc, P, List, Li, ref, val, type DotPath } from "tskb";

type SampleTsconfig = typeof import("../../tsconfig.json");

const CliTerm = ref as tskb.Terms["cli"];
const SampleTsconfigModule = ref as tskb.Modules["sample.tsconfig.json"];
const CliBuildExport = ref as tskb.Exports["cli.build"];

const JsxOpt = val as DotPath<SampleTsconfig, ["compilerOptions", "jsx"]>;
const JsxImportSourceOpt = val as DotPath<SampleTsconfig, ["compilerOptions", "jsxImportSource"]>;

export default (
  <Doc explains="What's the typical workflow for setting up tskb in a repo?" priority="essential">
    <P>
      Adopting tskb in a project follows a small fixed sequence: configure, declare, write, build.
    </P>
    <List>
      <Li>
        Create a <code>docs/</code> folder for <code>.tskb.tsx</code> files.
      </Li>
      <Li>
        Add a tsconfig like {SampleTsconfigModule} pointing at the repo root. Set{" "}
        <code>{JsxOpt}</code> to <code>"react-jsx"</code> and <code>{JsxImportSourceOpt}</code> to{" "}
        <code>"tskb"</code>.
      </Li>
      <Li>
        Declare structural elements (Folders, Modules, Exports, Terms, Files) using global namespace
        augmentation. Use <code>typeof import()</code> for type-safe references.
      </Li>
      <Li>
        Write <code>*.tskb.tsx</code> files using the JSX components. TypeScript validates every
        reference at compile time.
      </Li>
      <Li>
        Run {CliBuildExport} via the {CliTerm}:
        <code>tskb &quot;**/*.tskb.tsx&quot; --tsconfig tsconfig.json</code>.
      </Li>
    </List>
  </Doc>
);
