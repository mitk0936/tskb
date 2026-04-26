import { type Module, type Export, type Term, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "extraction.documentation": Module<{
        desc: "Documentation extraction module that parses JSX trees to extract content and references from .tskb.tsx files";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js");
      }>;
    }

    interface Exports {
      extractDocs: Export<{
        desc: "Entry point: iterates source files matched by the glob, calls extractFromTsxFile on each .tskb.tsx file, returns ExtractedDoc[]. Accepts an optional ExtractedRegistry used to pre-compute display attributes in the HTML output.";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js").extractDocs;
      }>;

      ExtractedDoc: Export<{
        desc: "Shape of one extracted doc: filePath, format, explains, priority, HTML content string, reference arrays (modules/terms/folders/exports/files/externals), semantic relations, and extracted flows.";
        type: import("packages/tskb/src/core/extraction/documentation.js").ExtractedDoc;
      }>;

      extractFromTsxFile: Export<{
        desc: "Processes a single .tskb.tsx source file: finds the default export, runs buildConstantReferencesMap and extractJsxContent, returns an ExtractedDoc or null if no default export is found.";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js").extractFromTsxFile;
      }>;

      buildConstantReferencesMap: Export<{
        desc: "First pass over the source file: walks all variable declarations and maps const names to {category, name} by parsing 'ref as tskb.X[\"y\"]' type assertions. Result is passed into extractJsxContent so inline {MyConst} expressions resolve without re-parsing.";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js").buildConstantReferencesMap;
      }>;

      extractJsxContent: Export<{
        desc: "Main JSX depth-first traversal: structural tags (H1, P, List) emit HTML, XxxRef tags and inline identifier/type-assertion expressions route through the refCategoryMap dispatch table to createReferenceContent, Flow elements validate and collect steps, Relation elements collect edges.";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js").extractJsxContent;
      }>;

      createReferenceContent: Export<{
        desc: "Produces the <a class=tskb-ref> anchor for a single registry reference. Embeds data-node-id, data-node-type, and data-node-display attributes pre-computed from the registry so the explorer doc panel can show tooltips before the chunk is loaded. Pushes the id into the appropriate references sub-array.";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js").createReferenceContent;
      }>;

      resolveNodeMeta: Export<{
        desc: "Looks up a nodeId across all registry maps (modules, folders, exports, terms, files, externals) and returns {nodeType, display}. Used by extractJsxContent for flow step links so each step anchor carries the same pre-computed attributes as regular refs.";
        type: typeof import("packages/tskb/src/core/extraction/documentation.js").resolveNodeMeta;
      }>;
    }

    interface Terms {
      jsxElement: Term<"A JSX syntax node in the TypeScript AST representing an element like <Doc> or <P>, containing opening tag, children, and closing tag">;
      jsxExpression: Term<"A TypeScript AST node representing an embedded expression in JSX curly braces like {ref as tskb.Folders['Auth']}">;
      typeAssertion: Term<"TypeScript 'as' syntax that casts a value to a specific type, used in tskb to reference vocabulary items: {ref as tskb.Modules['X']}">;
      depthFirstTraversal: Term<"Tree traversal algorithm that explores as far as possible along each branch before backtracking, used to visit all JSX nodes in order">;
      constantReferencesMap: Term<"A Map built at parse time that resolves local const names (e.g. AuthModule) to their registry key and category by reading the 'ref as tskb.X[\"y\"]' type assertion on each declaration. Lets the traversal resolve {AuthModule} inline expressions.">;
      refCategoryMap: Term<"A dispatch table in extractJsxContent mapping JSX tag names (ModuleRef, TermRef, FolderRef, ExportRef, FileRef, ExternalRef) to their registry category string. All XxxRef elements route through the same createReferenceContent helper.">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const DocModuleRef = ref as tskb.Modules["extraction.documentation"];
const ExtractDocsExport = ref as tskb.Exports["extractDocs"];
const ExtractedDocExport = ref as tskb.Exports["ExtractedDoc"];
const ExtractFromTsxFileExport = ref as tskb.Exports["extractFromTsxFile"];
const BuildConstantReferencesMapExport = ref as tskb.Exports["buildConstantReferencesMap"];
const ExtractJsxContentExport = ref as tskb.Exports["extractJsxContent"];
const CreateReferenceContentExport = ref as tskb.Exports["createReferenceContent"];
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
  <Doc explains="Documentation extraction: JSX AST traversal, reference collection, and HTML content generation">
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
      Each file is processed by {ExtractFromTsxFileExport} in two steps. First,{" "}
      {BuildConstantReferencesMapExport} walks all variable declarations and builds the{" "}
      {ConstantReferencesMapTerm} — a lookup from local const names like <code>AuthModule</code> to
      their registry key. This lets the JSX traversal resolve inline <code>{"{AuthModule}"}</code>{" "}
      expressions without re-parsing the {TypeAssertionTerm}. Second, {ExtractJsxContentExport}{" "}
      performs {DepthFirstTraversalTerm} over the default export JSX tree, emitting HTML and
      collecting references.
    </P>

    <H2>Reference resolution</H2>
    <P>
      References appear in three forms: explicit tag elements (<code>{"<ModuleRef>"}</code>,{" "}
      <code>{"<TermRef>"}</code>, etc.), inline identifier expressions (
      <code>{"{AuthModule}"}</code>), and inline type assertions (
      <code>{"{ref as tskb.Modules['auth']}"}</code>). All three routes converge on{" "}
      {CreateReferenceContentExport} via the {RefCategoryMapTerm} dispatch table inside{" "}
      {ExtractJsxContentExport}.
    </P>
    <P>
      {CreateReferenceContentExport} embeds <code>data-node-type</code> and{" "}
      <code>data-node-display</code> attributes pre-computed from {RegistryModule} so the explorer
      doc panel can render tooltips for unloaded nodes before their chunk is fetched.
    </P>

    <H2>Flow and Relation extraction</H2>
    <P>
      {FlowComponent} elements are validated inside {ExtractJsxContentExport} — only {StepComponent}{" "}
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
        label="Finds default export, initialises references object and flow/relation collectors"
      />
      <Step
        node={BuildConstantReferencesMapExport}
        label="Walks all variable declarations; maps const names → {category, name} via type-assertion parsing"
      />
      <Step
        node={RegistryModule}
        label="Passed in as optional param; queried by createReferenceContent to pre-compute data-node-display values"
      />
      <Step
        node={ExtractJsxContentExport}
        label="Depth-first JSX traversal: structural tags → HTML, XxxRef / inline refs → refCategoryMap → createReferenceContent; Flow elements validated and collected"
      />
      <Step
        node={CreateReferenceContentExport}
        label="Emits <a class=tskb-ref data-node-id data-node-type data-node-display>; pushes id into references sub-array"
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
