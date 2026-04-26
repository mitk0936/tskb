import {
  type Module,
  type Export,
  Doc,
  H1,
  H2,
  P,
  List,
  Li,
  Flow,
  Step,
  Relation,
  ref,
} from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.spa.main": Module<{
        desc: "ExplorerApp class — top-level SPA controller. mount() orchestrates four setup methods (setupCanvas, setupTooltips, setupRenderer, setupSearch) then loads meta.json via loadInitialData(). The render() method drives the full D3 enter/update/exit cycle on every store change or UI interaction. Interaction handlers (onExpand, onSelect, onTraceLinks) are private methods passed as callbacks to the renderer. UI state (expanded set, selected node, search query) lives on the class instance; graph data lives in GraphStore.";
        type: typeof import("packages/tskb/explorer-app/src/main.js");
      }>;

      "explorer.spa.chunk-types": Module<{
        desc: "Discriminated union types for all chunk shapes (MetaChunk, FolderChunk) plus the ChunkRegistry map and a typed URL builder. Extend ChunkRegistry here to add new chunk kinds.";
        type: typeof import("packages/tskb/explorer-app/src/graph/chunk-types.js");
      }>;

      "explorer.spa.loader": Module<{
        desc: "ChunkLoader: type-safe generic fetch keyed by ChunkKind, LRU-bounded in-memory cache (50 chunks), deduplication of in-flight requests";
        type: typeof import("packages/tskb/explorer-app/src/graph/loader.js");
      }>;

      "explorer.spa.store": Module<{
        desc: "GraphStore: pure data store holding meta chunk and folder chunks. UI state (expanded set, selected node, search query) lives outside in main.ts";
        type: typeof import("packages/tskb/explorer-app/src/store/graph-store.js");
      }>;

      "explorer.spa.lane-engine": Module<{
        desc: "computeLayout(): builds a d3.hierarchy from visible structure nodes, runs d3.tree for left-to-right positioning, then lays docs and other nodes as horizontal lists below. Collapsed folders with _childCount > 0 inject up to 4 ghost placeholder nodes so the tree reserves space for their children.";
        type: typeof import("packages/tskb/explorer-app/src/layout/lane-engine.js");
      }>;

      "explorer.spa.node-base": Module<{
        desc: "NodeComponent interface (enter, update, anchor, getSize) and BaseNodeRenderer: renders any node type as a rounded-rect card with a <> code preview bubble (top-center) and a + expand bubble (right edge). Ghost nodes (detail._ghost = 'true') render as dashed transparent cards showing only their filename label. Tooltip anchor is the node's right-center SVG position.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/base.js");
      }>;

      "explorer.spa.node-index": Module<{
        desc: "Node renderer factory module. createNodeRenderer() is the single dispatch point: currently always returns BaseNodeRenderer; add a type-specific case here when a node type needs a custom renderer.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/index.js");
      }>;

      "explorer.spa.edge-renderer": Module<{
        desc: "buildStructureLinks() derives parent→child links from parentId, marking ghost links via detail._ghost; renderStructureEdges() draws cubic-bezier SVG paths (dashed + lower opacity for ghost links); renderLaneBands() renders lane background bands with labels; buildRelationLinks() shows cross-edges (imports / related-to) only when both endpoints are directly visible; renderRelationEdges() draws tapered filled band shapes between them";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js");
      }>;

      "explorer.spa.boundary-renderer": Module<{
        desc: "renderBoundaryGroups() draws a freeform dashed hull outline around all visible nodes that belong to the same architectural boundary. Hierarchy resolution: only the top-level folder carries detail.boundary; all descendants are resolved by walking parentOf. Hull is computed via d3.polygonHull, perturbed with seeded pseudo-random wobble for a stable hand-drawn look, and smoothed with curveBasisClosed.";
        type: typeof import("packages/tskb/explorer-app/src/components/BoundaryRenderer.js");
      }>;

      "explorer.spa.spinner": Module<{
        desc: "Global and per-node spinner helpers: showGlobalSpinner/hideGlobalSpinner overlay a full-screen loader; showNodeSpinner/removeNodeSpinner attach a small SVG spinner next to a node while its chunk is loading";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js");
      }>;

      "explorer.spa.node-tooltip": Module<{
        desc: "Hover tooltip anchored to the node's right-center SVG position. Shows a coloured dot, node name, monospace path, and description. Receives updateNodeTooltipTransform() calls from main.ts on every zoom event so it repositions to track the node. Uses mouseover/mouseout bubbling with relatedTarget boundary guards to avoid flicker on child SVG elements.";
        type: typeof import("packages/tskb/explorer-app/src/ui/NodeTooltip.js");
      }>;

      "explorer.spa.code-tooltip": Module<{
        desc: "Toggle-based code preview popup for module nodes. Click the <> bubble to show/hide; clicking the same node again dismisses it; clicking outside also dismisses. Renders morphology lines with an inline TypeScript tokenizer (no runtime deps) for syntax highlighting, prepended by import lines with a blank-line separator.";
        type: typeof import("packages/tskb/explorer-app/src/ui/CodeTooltip.js");
      }>;

      "explorer.spa.doc-panel": Module<{
        desc: "Side panel that slides in from the right when a node is selected or a chip is clicked. show(node) renders the node's HTML content or a structured key-value fallback. showRefs(node, kind, items) renders a docs or flows accordion. wireRefLinks() post-processes every tskb-ref anchor: resolves display text, wires hover to DomTooltip, and triggers setOnNodePrefetch to background-load the containing folder chunk on hover so the tooltip updates with description and correct color once the chunk arrives. Styled by doc-panel.css.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DocPanel.js");
      }>;

      "explorer.spa.dom-tooltip": Module<{
        desc: "Lightweight DOM-anchored tooltip used by DocPanel ref links. Positioned above the hovered anchor element (no SVG coordinate math). Separate from NodeTooltip which is SVG-anchored and zoom-aware. mountDomTooltip() appends the element once; showDomTooltip() builds content and repositions; hideDomTooltip() fades out.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DomTooltip.js");
      }>;
    }

    interface Exports {
      "explorer.spa.ChunkLoader": Export<{
        desc: "Type-safe chunk fetcher with LRU cache and in-flight deduplication. load(kind, ...args) return type is inferred from ChunkRegistry[K].";
        type: typeof import("packages/tskb/explorer-app/src/graph/loader.js").ChunkLoader;
      }>;

      "explorer.spa.GraphStore": Export<{
        desc: "Pure data store holding meta chunk and folder chunks. Exposes subscribe(listener) for reactive re-render; UI state lives outside in main.ts.";
        type: typeof import("packages/tskb/explorer-app/src/store/graph-store.js").GraphStore;
      }>;

      "explorer.spa.computeLayout": Export<{
        desc: "Computes SVG positions for all visible nodes across three lanes (Structure, Docs, Terms/Flows). Called on every expand/collapse; returns a LaneLayout consumed by node and edge renderers.";
        type: typeof import("packages/tskb/explorer-app/src/layout/lane-engine.js").computeLayout;
      }>;

      "explorer.spa.buildStructureLinks": Export<{
        desc: "Derives parent→child StructureLink pairs from the parentId field of every positioned node. Ghost links are flagged for dashed rendering.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js").buildStructureLinks;
      }>;

      "explorer.spa.renderStructureEdges": Export<{
        desc: "Draws parent→child cubic-bezier SVG paths from a StructureLink list. Ghost links render with dashed stroke and reduced opacity.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js").renderStructureEdges;
      }>;

      "explorer.spa.BaseNodeRenderer": Export<{
        desc: "Default NodeComponent implementation: renders any node type as a rounded-rect card with type icon, label, description, edge-count badge, code preview bubble, and expand bubble.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/base.js").BaseNodeRenderer;
      }>;

      "explorer.spa.createNodeRenderer": Export<{
        desc: "Factory that constructs a NodeComponent from the full set of interaction callbacks (onExpand, onSelect, onTraceLinks, hasChildren, isExpanded, onCodePreview, onChipClick, getReferencingDocs, getReferencingFlows). Currently always returns BaseNodeRenderer. Add a type-dispatch switch here when a node type needs its own renderer.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/index.js").createNodeRenderer;
      }>;

      "explorer.spa.renderBoundaryGroups": Export<{
        desc: "Renders one <g.boundary-group> per boundary into the provided SVG layer. Boundary membership is resolved by walking parentOf from each visible node upward until a node with detail.boundary is found. Uses d3.polygonHull with seeded wobble perturbation and curveBasisClosed for a stable freeform outline. pointer-events: none on all elements.";
        type: typeof import("packages/tskb/explorer-app/src/components/BoundaryRenderer.js").renderBoundaryGroups;
      }>;

      "explorer.spa.showNodeSpinner": Export<{
        desc: "Appends a small animated SVG ring at a given (x, y) position inside the node canvas layer. Returns the SVG group element so the caller can remove it via removeNodeSpinner.";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js").showNodeSpinner;
      }>;

      "explorer.spa.removeNodeSpinner": Export<{
        desc: "Removes the SVG group returned by showNodeSpinner from the DOM. Called in the finally block of ExplorerApp.onExpand() after the chunk fetch resolves or rejects.";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js").removeNodeSpinner;
      }>;

      "explorer.spa.DocPanel": Export<{
        desc: "Class managing the detail side panel. show(node) opens with node HTML or key-value fallback; showRefs() opens a docs/flows accordion; hide() closes. Four callbacks wired by ExplorerApp: setOnNodeRef (click-through navigation), setGetNode (live node lookup), setOnNodeHighlight (canvas glow), setOnNodePrefetch (background chunk load on ref link hover).";
        type: typeof import("packages/tskb/explorer-app/src/ui/DocPanel.js").DocPanel;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const MainModule = ref as tskb.Modules["explorer.spa.main"];
const ChunkTypesModule = ref as tskb.Modules["explorer.spa.chunk-types"];
const LoaderModule = ref as tskb.Modules["explorer.spa.loader"];
const StoreModule = ref as tskb.Modules["explorer.spa.store"];
const LaneEngineModule = ref as tskb.Modules["explorer.spa.lane-engine"];
const NodeBaseModule = ref as tskb.Modules["explorer.spa.node-base"];
const NodeIndexModule = ref as tskb.Modules["explorer.spa.node-index"];
const CreateNodeRendererExport = ref as tskb.Exports["explorer.spa.createNodeRenderer"];
const EdgeRendererModule = ref as tskb.Modules["explorer.spa.edge-renderer"];
const BoundaryRendererModule = ref as tskb.Modules["explorer.spa.boundary-renderer"];
const RenderBoundaryGroupsExport = ref as tskb.Exports["explorer.spa.renderBoundaryGroups"];
const SpinnerModule = ref as tskb.Modules["explorer.spa.spinner"];
const NodeTooltipModule = ref as tskb.Modules["explorer.spa.node-tooltip"];
const CodeTooltipModule = ref as tskb.Modules["explorer.spa.code-tooltip"];
const DocPanelModule = ref as tskb.Modules["explorer.spa.doc-panel"];
const DocPanelExport = ref as tskb.Exports["explorer.spa.DocPanel"];
const DomTooltipModule = ref as tskb.Modules["explorer.spa.dom-tooltip"];

const ChunkLoaderExport = ref as tskb.Exports["explorer.spa.ChunkLoader"];
const GraphStoreExport = ref as tskb.Exports["explorer.spa.GraphStore"];
const ComputeLayoutExport = ref as tskb.Exports["explorer.spa.computeLayout"];
const BuildStructureLinksExport = ref as tskb.Exports["explorer.spa.buildStructureLinks"];
const RenderStructureEdgesExport = ref as tskb.Exports["explorer.spa.renderStructureEdges"];
const BaseNodeRendererExport = ref as tskb.Exports["explorer.spa.BaseNodeRenderer"];
const ShowNodeSpinnerExport = ref as tskb.Exports["explorer.spa.showNodeSpinner"];
const RemoveNodeSpinnerExport = ref as tskb.Exports["explorer.spa.removeNodeSpinner"];

const LaneTerm = ref as tskb.Terms["explorerLane"];
const NodeComponentTerm = ref as tskb.Terms["nodeComponent"];
const LruCacheTerm = ref as tskb.Terms["lruChunkCache"];
const GhostNodeTerm = ref as tskb.Terms["ghostNode"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="Explorer SPA architecture: D3 canvas, chunk loading, three-lane layout, node components, UI shell">
    <H1>Explorer SPA</H1>
    <P>
      The SPA is built with Vite (D3 in a separate vendor chunk) and lives in the{" "}
      <code>explorer-app/</code> directory. It is pre-built into <code>dist/explorer/</code> and
      shipped inside the tskb npm package. {MainModule} is the entry point that bootstraps the
      canvas, wires all interaction handlers, and drives the render loop.
    </P>

    <H2>Data layer</H2>
    <P>
      {ChunkTypesModule} defines the chunk discriminated union (<code>MetaChunk | FolderChunk</code>
      ) and the <code>ChunkRegistry</code> map that keys chunk kinds to their types. Adding a new
      chunk kind means extending this file only.
    </P>
    <P>
      {LoaderModule} provides {ChunkLoaderExport}: a generic <code>load(kind, ...args)</code> whose
      return type is inferred from <code>ChunkRegistry[K]</code>. It deduplicates in-flight requests
      and uses a {LruCacheTerm} (max 50 entries) so folders are not re-fetched on collapse/expand
      cycles.
    </P>
    <P>
      {GraphStoreExport} in {StoreModule} holds only graph data (meta chunk, folder chunks map).
      Data arrives via <code>loadMeta()</code> and <code>loadFolderChunk()</code>. UI state — the
      expanded node set, selected node, and search query — lives as plain variables in {MainModule}{" "}
      and is passed explicitly to {ComputeLayoutExport}, {RenderStructureEdgesExport}, and{" "}
      {BaseNodeRendererExport}. The store exposes <code>subscribe(listener)</code> for reactive
      re-render.
    </P>

    <Relation from={StoreModule} to={ChunkTypesModule} label="stores chunks typed by" />
    <Relation from={LoaderModule} to={ChunkTypesModule} label="types fetch results via" />
    <Relation from={MainModule} to={StoreModule} label="subscribes to" />

    <H2>Three-lane layout</H2>
    <P>
      {LaneEngineModule} computes all SVG positions in a single pass. The canvas has three{" "}
      {LaneTerm}s stacked vertically:
    </P>
    <List>
      <Li>
        <strong>Structure</strong> — builds a <code>d3.hierarchy</code> from the visible tree (root
        → expanded folders → modules → exports, including sub-folder nesting). Runs{" "}
        <code>d3.tree().nodeSize()</code> for left-to-right positioning. Collapsed folders with{" "}
        <code>_childCount &gt; 0</code> inject ghost placeholder nodes so the tree pre-reserves
        space for their children.
      </Li>
      <Li>
        <strong>Docs</strong> — horizontal list ordered by priority (essential → constraint →
        supplementary).
      </Li>
      <Li>
        <strong>Terms / Flows</strong> — horizontal list below docs.
      </Li>
    </List>
    <P>
      On every expand or collapse, {MainModule} calls {ComputeLayoutExport} and fully re-renders the
      D3 selection with enter/update/exit.
    </P>

    <H2>Node components</H2>
    <P>
      {NodeIndexModule} is the extension point for node rendering: {CreateNodeRendererExport}{" "}
      accepts all interaction callbacks and returns a {NodeComponentTerm}. Currently always
      delegates to {BaseNodeRendererExport}; add a type-dispatch switch here when a node type needs
      its own renderer. {NodeBaseModule} defines the {NodeComponentTerm} interface and{" "}
      {BaseNodeRendererExport} — the default renderer for all node types. Each node is an SVG{" "}
      <code>&lt;g&gt;</code> containing a rounded-rect card, type icon, label, description,
      edge-count badge, a <code>&lt;&gt;</code> code preview bubble (top-center), and a{" "}
      <code>+</code> expand bubble (right edge). {GhostNodeTerm}s render as dashed transparent
      placeholders showing only their filename.
    </P>
    <P>
      {EdgeRendererModule} derives parent→child links via {BuildStructureLinksExport} and draws them
      as horizontal cubic-bezier SVG paths via {RenderStructureEdgesExport}. Ghost links (where
      either endpoint has <code>detail._ghost = 'true'</code>) render with a dashed stroke and
      reduced opacity. It also renders the labeled background bands for each lane.
    </P>

    <P>
      {BoundaryRendererModule} draws architectural boundary outlines. When a folder node carries{" "}
      <code>detail.boundary</code>, all visible descendants (resolved by walking{" "}
      <code>parentOf</code>) are grouped under that boundary name. {RenderBoundaryGroupsExport}{" "}
      computes a convex hull over the bounding boxes of all member nodes, perturbs the hull points
      with a seeded pseudo-random wobble (stable across re-renders), and smooths the result with{" "}
      <code>d3.curveBasisClosed</code> for a hand-drawn look. The outline renders as a violet dashed
      stroke with a near-transparent fill and a pill label at the top. All elements have{" "}
      <code>pointer-events: none</code>.
    </P>

    <Relation from={NodeBaseModule} to={LaneEngineModule} label="reads NODE_SIZES from" />
    <Relation from={EdgeRendererModule} to={LaneEngineModule} label="reads LaneLayout from" />
    <Relation from={MainModule} to={LaneEngineModule} label="calls computeLayout on each render" />
    <Relation from={MainModule} to={NodeBaseModule} label="calls enter/update on node selections" />
    <Relation from={MainModule} to={EdgeRendererModule} label="calls renderStructureEdges" />
    <Relation from={MainModule} to={BoundaryRendererModule} label="calls renderBoundaryGroups" />
    <Relation from={MainModule} to={NodeTooltipModule} label="propagates zoom transform to" />
    <Relation from={MainModule} to={CodeTooltipModule} label="propagates zoom transform to" />
    <Relation from={MainModule} to={DocPanelModule} label="opens on node select or chip click" />
    <Relation from={DocPanelModule} to={DomTooltipModule} label="shows on ref link hover" />
    <Relation from={NodeBaseModule} to={NodeTooltipModule} label="triggers show/hide on hover" />
    <Relation from={NodeBaseModule} to={CodeTooltipModule} label="triggers toggle on <> click" />

    <H2>UI shell</H2>
    <P>
      {SpinnerModule} provides a full-screen global spinner (shown while <code>meta.json</code>{" "}
      loads) and a per-node inline spinner: {ShowNodeSpinnerExport} appends an animated SVG ring at
      the node's canvas position; {RemoveNodeSpinnerExport} removes it in the <code>finally</code>{" "}
      block after the chunk fetch settles.
    </P>
    <P>
      {NodeTooltipModule} appears on hover, anchored to the node's right-center SVG position.{" "}
      {CodeTooltipModule} is a click-toggled code preview popup anchored to the node's top-center
      SVG position. Both receive <code>updateXxxTransform()</code> calls from {MainModule} on every
      D3 zoom event so they reposition to track their anchor nodes as the canvas pans and zooms.
    </P>
    <P>
      {DocPanelExport} in {DocPanelModule} is the detail side panel. Clicking a node calls{" "}
      <code>show(node)</code>, which renders the node's HTML content or a key-value fallback for
      non-doc nodes. Clicking a docs or flows chip calls <code>showRefs(node, kind, items)</code>,
      which renders an accordion. The panel header shows the node's relative path in monospace. Ref
      link anchors (<code>a.tskb-ref</code>) inside the body are post-processed by{" "}
      <code>wireRefLinks()</code>: hover shows a {DomTooltipModule} with the node's path, type
      color, and description; if the node's chunk isn't loaded yet, a background prefetch fires via
      the <code>setOnNodePrefetch</code> callback — the tooltip updates in place when data arrives.
      Click-through navigation is handled via <code>setOnNodeRef</code>.
    </P>

    <Flow
      name="explorer-expand-flow"
      desc="User expands a folder node: chunk is fetched, store updated, layout recomputed, SVG re-rendered"
      priority="supplementary"
    >
      <Step
        node={NodeBaseModule}
        label="User clicks + expand button; BaseNodeRenderer fires the onExpand callback"
      />
      <Step
        node={MainModule}
        label="ExplorerApp.onExpand(): calls showNodeSpinner, delegates to loader, calls removeNodeSpinner in finally; adds node id to expanded set"
      />
      <Step
        node={LoaderModule}
        label="ChunkLoader.load('folder', id) — returns cached chunk or fetches /chunks/folder-{sanitizedId}.json"
      />
      <Step
        node={StoreModule}
        label="store.loadFolderChunk() stores chunk; store notifies subscribers, triggering ExplorerApp.render()"
      />
      <Step
        node={ComputeLayoutExport}
        label="render() calls computeLayout(store, expanded) — rebuilds d3.hierarchy and recomputes all SVG positions"
      />
      <Step
        node={BuildStructureLinksExport}
        label="render() calls buildStructureLinks() — derives parent→child link list from updated parentId fields"
      />
      <Step
        node={RenderStructureEdgesExport}
        label="render() calls renderStructureEdges() — redraws cubic-bezier SVG paths; ghost links rendered dashed"
      />
      <Step
        node={NodeBaseModule}
        label="render() D3 enter/update/exit — new node cards enter with fade-in, collapsed nodes exit with fade-out"
      />
    </Flow>
  </Doc>
);
