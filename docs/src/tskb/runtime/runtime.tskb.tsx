import {
  type Module,
  type Export,
  type DocPriority,
  Doc,
  H1,
  ref,
  val,
  P,
  H2,
  List,
  Li,
  Relation,
} from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      "runtime.jsx": Module<{
        desc: "All JSX tags users can write inside .tskb.tsx files.";
        type: typeof import("packages/tskb/src/runtime/jsx.js");
      }>;

      "runtime.registry": Module<{
        desc: "Type definitions for the registry primitives (Folder, Module, Export, Term, File, External).";
        type: typeof import("packages/tskb/src/runtime/registry.js");
      }>;
    }

    interface Exports {
      "jsx.Doc": Export<{
        desc: "The root tag of a doc file. Answers one question via its `explains` prop.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Doc;
      }>;
      "jsx.H1": Export<{
        desc: "Heading level 1.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H1;
      }>;
      "jsx.H2": Export<{
        desc: "Heading level 2.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H2;
      }>;
      "jsx.H3": Export<{
        desc: "Heading level 3.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H3;
      }>;
      "jsx.P": Export<{
        desc: "Paragraph.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").P;
      }>;
      "jsx.List": Export<{
        desc: "List container.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").List;
      }>;
      "jsx.Li": Export<{
        desc: "List item.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Li;
      }>;
      "jsx.Snippet": Export<{
        desc: "A type-checked code example.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Snippet;
      }>;
      "jsx.Adr": Export<{
        desc: "An Architecture Decision Record.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Adr;
      }>;
      "jsx.ref": Export<{
        desc: "Placeholder for declaring a typed reference to a registered node.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").ref;
      }>;
      "jsx.Relation": Export<{
        desc: "A labeled edge between two registered nodes.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Relation;
      }>;
      DocPriority: Export<{
        desc: "How important a doc is: `essential`, `constraint`, or `supplementary`.";
        type: import("packages/tskb/src/runtime/jsx.js").DocPriority;
      }>;
      "jsx.Flow": Export<{
        desc: "A named, ordered sequence of steps through the system.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Flow;
      }>;
      "jsx.Step": Export<{
        desc: "One step inside a Flow, pointing at a registered node.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Step;
      }>;
    }
  }
}

const RuntimeFolder = ref as tskb.Folders["tskb.runtime"];
const JsxModule = ref as tskb.Modules["runtime.jsx"];
const RegistryModule = ref as tskb.Modules["runtime.registry"];
const DocExport = ref as tskb.Exports["jsx.Doc"];
const AdrExport = ref as tskb.Exports["jsx.Adr"];
const RefExport = ref as tskb.Exports["jsx.ref"];
const DocPriorityExport = ref as tskb.Exports["DocPriority"];
const FlowExport = ref as tskb.Exports["jsx.Flow"];
const StepExport = ref as tskb.Exports["jsx.Step"];
const ExampleTerm = ref as tskb.Terms["graph"];

const Essential = val as Extract<DocPriority, "essential">;
const Constraint = val as Extract<DocPriority, "constraint">;
const Supplementary = val as Extract<DocPriority, "supplementary">;

export default (
  <Doc
    explains="What does the runtime module provide and what does it not do?"
    priority="essential"
  >
    <H1>Runtime</H1>
    <P>
      Located in {RuntimeFolder}. Contains registry type definitions and JSX primitives - no actual
      runtime execution.
    </P>
    <H2>Modules</H2>
    <List>
      <Li>
        {JsxModule}: JSX runtime with {DocExport} (requires explains prop and optional priority via{" "}
        {DocPriorityExport}: <code>{Essential}</code>, <code>{Constraint}</code>, or{" "}
        <code>{Supplementary}</code>). Includes heading/paragraph/list components, {AdrExport} for
        Architecture Decision Records, and {RefExport} for type-safe registry references.
      </Li>
      <Li>
        {JsxModule} also provides {FlowExport} and {StepExport} for defining named, ordered
        sequences through the system. Flows become first-class graph nodes with priority support.
        Only Step children are allowed inside Flow (validated at build time).
      </Li>
      <Li>
        {RegistryModule}: Type definitions for Folder, Module, Export, Term interfaces used in
        global namespace augmentation.
      </Li>
    </List>
    <H2>Purpose</H2>
    <P>
      Provides TypeScript types and JSX functions for authoring *.tskb.tsx files. Registry
      interfaces enable type-safe vocabulary declarations. JSX components structure documentation
      content.
    </P>
    <H2>Semantic Relations</H2>
    <P>
      The <b>Relation</b> tag creates a semantic edge in the knowledge graph between two nodes. It
      is type-safe and supports any registered Folder, Module, Term, or Export. The optional{" "}
      <b>label</b> prop allows you to describe the relationship (e.g., "depends on").
    </P>
    <Relation from={JsxModule} to={ExampleTerm} label="runtime describes graph" />
    <P>
      This will emit a <b>related-to</b> edge from the <b>runtime.jsx</b> module to the <b>Graph</b>{" "}
      term in the TSKB graph, with the label "runtime describes graph".
    </P>
  </Doc>
);
