import { type Module, type Export, type Term, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "extraction.documentation": Module<{
        desc: "Reads `.tskb.tsx` files and extracts their content, references, relations, and flows.";
        type: typeof import("packages/tskb/src/core/extraction/documentation/index.js");
      }>;
    }

    interface Exports {
      extractDocs: Export<{
        desc: "Extracts every `.tskb.tsx` file matched by the glob.";
        type: typeof import("packages/tskb/src/core/extraction/documentation/index.js").extractDocs;
      }>;

      ExtractedDoc: Export<{
        desc: "The data extracted from one doc file.";
        type: import("packages/tskb/src/core/extraction/documentation/index.js").ExtractedDoc;
      }>;

      extractFromTsxFile: Export<{
        desc: "Extracts one `.tskb.tsx` file.";
        type: typeof import("packages/tskb/src/core/extraction/documentation/index.js").extractFromTsxFile;
      }>;

      buildRefMap: Export<{
        desc: "Maps each `const` in a doc file to the registry node it points to.";
        type: typeof import("packages/tskb/src/core/extraction/documentation/index.js").buildRefMap;
      }>;

      JsxExtractor: Export<{
        desc: "Walks the JSX tree of a doc file and collects content, refs, relations, and flows.";
        type: typeof import("packages/tskb/src/core/extraction/documentation/index.js").JsxExtractor;
      }>;

      buildRefLink: Export<{
        desc: "Builds the HTML anchor for one inline reference.";
        type: typeof import("packages/tskb/src/core/extraction/documentation/index.js").buildRefLink;
      }>;

      resolveNodeMeta: Export<{
        desc: "Looks up a node id in the registry and returns its type and display name.";
        type: typeof import("packages/tskb/src/core/extraction/documentation/index.js").resolveNodeMeta;
      }>;
    }

    interface Terms {
      jsxElement: Term<"A JSX node in the source tree, like `<Doc>` or `<P>`.">;
      jsxExpression: Term<"A `{ ... }` expression embedded inside JSX.">;
      typeAssertion: Term<"TypeScript's `as` syntax. tskb uses it to point a `ref` at a registry entry: `ref as tskb.Modules['X']`.">;
      depthFirstTraversal: Term<"Tree traversal that follows each branch to its end before moving to the next. Used to walk JSX in order.">;
      constantReferencesMap: Term<"A lookup from each `const` in a doc file to the registry node it points to.">;
      refCategoryMap: Term<"A lookup from a JSX tag name to the registry category it belongs to.">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const DocModuleRef = ref as tskb.Modules["extraction.documentation"];
const ExtractDocsExport = ref as tskb.Exports["extractDocs"];
const ExtractedDocExport = ref as tskb.Exports["ExtractedDoc"];
const ExtractFromTsxFileExport = ref as tskb.Exports["extractFromTsxFile"];
const BuildRefMapExport = ref as tskb.Exports["buildRefMap"];
const JsxExtractorExport = ref as tskb.Exports["JsxExtractor"];
const BuildRefLinkExport = ref as tskb.Exports["buildRefLink"];
const ResolveNodeMetaExport = ref as tskb.Exports["resolveNodeMeta"];

const RegistryModule = ref as tskb.Modules["extraction.registry"];
const GraphBuilderModule = ref as tskb.Modules["graph.builder"];

const FlowComponent = ref as tskb.Exports["jsx.Flow"];
const StepComponent = ref as tskb.Exports["jsx.Step"];

const TypeAssertionTerm = ref as tskb.Terms["typeAssertion"];
const ConstantReferencesMapTerm = ref as tskb.Terms["constantReferencesMap"];
const RefCategoryMapTerm = ref as tskb.Terms["refCategoryMap"];
const DepthFirstTraversalTerm = ref as tskb.Terms["depthFirstTraversal"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does tskb turn .tskb.tsx files into HTML, references, and graph edges?">
    <H1>Documentation Extraction</H1>
    <P>
      {DocModuleRef} is the second extraction pass in the build pipeline. {ExtractDocsExport}{" "}
      receives the TypeScript <code>Program</code> and the {RegistryModule} output, and produces an{" "}
      {ExtractedDocExport} for each <code>.tskb.tsx</code> file. Each result carries the HTML
      content string, the reference arrays used to build graph edges, and any embedded{" "}
      {FlowComponent} and <code>{"<Relation>"}</code> declarations.
    </P>

    <H2>Two-pass strategy per file</H2>
    <P>
      Each file is processed by {ExtractFromTsxFileExport} in two steps. First, {BuildRefMapExport}{" "}
      walks all variable declarations and builds the {ConstantReferencesMapTerm} — a lookup from
      local const names like <code>AuthModule</code> to their registry key. This lets the traversal
      resolve inline <code>{"{AuthModule}"}</code> expressions without re-parsing the{" "}
      {TypeAssertionTerm}. Second, {JsxExtractorExport} is instantiated with the map and performs{" "}
      {DepthFirstTraversalTerm} over the default export JSX tree, accumulating HTML and references.
    </P>

    <H2>Reference resolution</H2>
    <P>
      References appear in three forms: explicit tag elements (<code>{"<ModuleRef>"}</code>,{" "}
      <code>{"<TermRef>"}</code>, etc.), inline identifier expressions (
      <code>{"{AuthModule}"}</code>), and inline type assertions (
      <code>{"{ref as tskb.Modules['auth']}"}</code>). All three routes converge on{" "}
      {BuildRefLinkExport} via the {RefCategoryMapTerm} dispatch table inside {JsxExtractorExport}.
    </P>
    <P>
      {BuildRefLinkExport} embeds <code>data-node-type</code> and <code>data-node-display</code>{" "}
      attributes pre-computed from {RegistryModule} so the explorer doc panel can render tooltips
      for unloaded nodes before their chunk is fetched.
    </P>

    <H2>Flow and Relation extraction</H2>
    <P>
      {FlowComponent} elements are validated inside {JsxExtractorExport} — only {StepComponent}{" "}
      children are allowed, text nodes throw. Each {StepComponent} node attribute is resolved
      through {ConstantReferencesMapTerm}, then {ResolveNodeMetaExport} looks up the node type and
      display string from the registry so every step link carries the same pre-computed attributes
      as regular refs. Validated flows are pushed into the <code>flows[]</code> array of{" "}
      {ExtractedDocExport} and also emitted as an HTML <code>{'<div class="tskb-flow">'}</code>{" "}
      block.
    </P>

    <Flow
      name="docs-extraction-pipeline"
      desc="Single .tskb.tsx file through extraction: constant map → JSX traversal → HTML + references"
    >
      <Step
        node={ExtractDocsExport}
        label="Iterates Program source files; dispatches matched .tsx files to extractFromTsxFile"
      />
      <Step
        node={ExtractFromTsxFileExport}
        label="Builds constant ref map, finds default export, instantiates JsxExtractor"
      />
      <Step
        node={BuildRefMapExport}
        label="Walks all variable declarations; maps const names → {category, name} via type-assertion parsing"
      />
      <Step
        node={RegistryModule}
        label="Passed in as optional param; queried by buildRefLink to pre-compute data-node-display values"
      />
      <Step
        node={JsxExtractorExport}
        label="Depth-first JSX traversal via visitElement dispatch: structural tags → HTML, XxxRef / inline refs → buildRefLink; Flow and Relation elements validated and collected"
      />
      <Step
        node={BuildRefLinkExport}
        label="Emits <a class=tskb-ref data-node-id data-node-type data-node-display>; pushes id into refs sub-array"
      />
      <Step
        node={ResolveNodeMetaExport}
        label="Called per Flow step: probes all registry maps to return {nodeType, display} for the step anchor"
      />
      <Step
        node={ExtractedDocExport}
        label="Returned: filePath, HTML content, references arrays, flows[], relations[]"
      />
      <Step
        node={GraphBuilderModule}
        label="Consumes ExtractedDoc: creates DocNode + FlowNode entries and references/flow-step edges"
      />
    </Flow>
  </Doc>
);
