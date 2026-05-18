import { Doc, P, List, Li, ref } from "tskb";

const CliTerm = ref as tskb.Terms["cli"];
const SampleTsconfigModule = ref as tskb.Modules["sample.tsconfig.json"];
const CliBuildExport = ref as tskb.Exports["cli.build"];

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
        Add a tsconfig like {SampleTsconfigModule} pointing at the repo root with{" "}
        <code>jsx: "react-jsx"</code> and <code>jsxImportSource: "tskb"</code>.
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
