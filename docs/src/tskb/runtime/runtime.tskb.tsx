import {
  type Folder,
  type Module,
  type Export,
  Doc,
  H1,
  ref,
  P,
  H2,
  List,
  Li,
  Snippet,
  Relation,
} from "tskb";

declare global {
  namespace tskb {
    interface Modules {
      "runtime.jsx": Module<{
        desc: "JSX runtime primitives - Doc, H1-H3, P, List, Li, Snippet components and ref helper";
        type: typeof import("packages/tskb/src/runtime/jsx.js");
      }>;

      "runtime.registry": Module<{
        desc: "Registry type definitions - Folder, Module, Export, Term interfaces for global namespace augmentation";
        type: typeof import("packages/tskb/src/runtime/registry.js");
      }>;
    }

    interface Exports {
      "jsx.Doc": Export<{
        desc: "Documentation container component. Requires an 'explains' prop that describes what the doc covers - used as the doc's description in search results and referencing doc lists";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Doc;
      }>;
      "jsx.H1": Export<{
        desc: "Heading level 1";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H1;
      }>;
      "jsx.H2": Export<{
        desc: "Heading level 2";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H2;
      }>;
      "jsx.H3": Export<{
        desc: "Heading level 3";
        type: typeof import("packages/tskb/src/runtime/jsx.js").H3;
      }>;
      "jsx.P": Export<{
        desc: "Paragraph";
        type: typeof import("packages/tskb/src/runtime/jsx.js").P;
      }>;
      "jsx.List": Export<{
        desc: "List container";
        type: typeof import("packages/tskb/src/runtime/jsx.js").List;
      }>;
      "jsx.Li": Export<{
        desc: "List item";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Li;
      }>;
      "jsx.Snippet": Export<{
        desc: "Code snippet component";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Snippet;
      }>;
      "jsx.Adr": Export<{
        desc: "Architecture Decision Record component with id, title, status, date, and deciders metadata";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Adr;
      }>;
      "jsx.ref": Export<{
        desc: "Reference placeholder for type assertions to registry items";
        type: typeof import("packages/tskb/src/runtime/jsx.js").ref;
      }>;
      "jsx.Relation": Export<{
        desc: "Semantic relation component. Creates a labeled or unlabeled related-to edge between two registry nodes in the knowledge graph. Props: from, to (node constants), optional label (string). Visible in CLI output.";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Relation;
      }>;
      DocPriority: Export<{
        desc: "Type for doc importance level: 'essential' (included in generated skill/instructions), 'constraint' (architectural rules for related areas), or 'supplementary' (graph-only, default)";
        type: import("packages/tskb/src/runtime/jsx.js").DocPriority;
      }>;
      "jsx.Flow": Export<{
        desc: "Flow component — defines a named, ordered sequence of steps through the system. Becomes a first-class graph node. Props: name, desc, optional priority. Only <Step> children allowed (validated at build time).";
        type: typeof import("packages/tskb/src/runtime/jsx.js").Flow;
      }>;
      "jsx.Step": Export<{
        desc: "Step component — a single participant in a Flow. The node prop references a registry node, optional label describes its role in the flow.";
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

export default (
  <Doc
    explains="Runtime module structure: JSX primitives and registry type definitions"
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
        {DocPriorityExport}: essential, constraint, or supplementary). Includes
        heading/paragraph/list components, {AdrExport} for Architecture Decision Records, and{" "}
        {RefExport} for type-safe registry references.
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
    <Snippet
      code={() => <Relation from={JsxModule} to={ExampleTerm} label="runtime describes graph" />}
    />
    <P>
      This will emit a <b>related-to</b> edge from the <b>runtime.jsx</b> module to the <b>Graph</b>{" "}
      term in the TSKB graph, with the label "runtime describes graph".
    </P>
  </Doc>
);
