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
        desc: "Entry point of the explorer SPA.";
        type: typeof import("packages/tskb/explorer-app/src/main.js");
      }>;

      "explorer.spa.chunk-types": Module<{
        desc: "Type definitions for the chunks the SPA loads.";
        type: typeof import("packages/tskb/explorer-app/src/graph/chunk-types.js");
      }>;

      "explorer.spa.loader": Module<{
        desc: "Loads chunks. Caches recent ones; de-duplicates parallel requests.";
        type: typeof import("packages/tskb/explorer-app/src/graph/loader.js");
      }>;

      "explorer.spa.store": Module<{
        desc: "Holds the loaded graph data for the SPA.";
        type: typeof import("packages/tskb/explorer-app/src/store/graph-store.js");
      }>;

      "explorer.spa.lane-engine": Module<{
        desc: "Lays out visible nodes on the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/layout/lane-engine.js");
      }>;

      "explorer.spa.node-base": Module<{
        desc: "Default node renderer for the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/base.js");
      }>;

      "explorer.spa.node-index": Module<{
        desc: "Picks the right node renderer for a given node type.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/index.js");
      }>;

      "explorer.spa.edge-renderer": Module<{
        desc: "Draws the edges between nodes on the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js");
      }>;

      "explorer.spa.boundary-renderer": Module<{
        desc: "Draws an outline around nodes that share a boundary.";
        type: typeof import("packages/tskb/explorer-app/src/components/BoundaryRenderer.js");
      }>;

      "explorer.spa.spinner": Module<{
        desc: "Global and per-node loading spinners.";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js");
      }>;

      "explorer.spa.node-tooltip": Module<{
        desc: "Hover tooltip for canvas nodes.";
        type: typeof import("packages/tskb/explorer-app/src/ui/NodeTooltip.js");
      }>;

      "explorer.spa.code-tooltip": Module<{
        desc: "Code preview popup shown for module nodes.";
        type: typeof import("packages/tskb/explorer-app/src/ui/CodeTooltip.js");
      }>;

      "explorer.spa.doc-panel": Module<{
        desc: "Side panel that shows the selected node's doc content.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DocPanel.js");
      }>;

      "explorer.spa.dom-tooltip": Module<{
        desc: "Tooltip anchored to a DOM element, used by the doc panel.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DomTooltip.js");
      }>;
    }

    interface Exports {
      "explorer.spa.ChunkLoader": Export<{
        desc: "Loads chunks for the SPA.";
        type: typeof import("packages/tskb/explorer-app/src/graph/loader.js").ChunkLoader;
      }>;

      "explorer.spa.GraphStore": Export<{
        desc: "Holds loaded graph data and notifies subscribers when it changes.";
        type: typeof import("packages/tskb/explorer-app/src/store/graph-store.js").GraphStore;
      }>;

      "explorer.spa.computeLayout": Export<{
        desc: "Computes positions for all visible nodes.";
        type: typeof import("packages/tskb/explorer-app/src/layout/lane-engine.js").computeLayout;
      }>;

      "explorer.spa.buildStructureLinks": Export<{
        desc: "Derives parent–child links from the visible nodes.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js").buildStructureLinks;
      }>;

      "explorer.spa.renderStructureEdges": Export<{
        desc: "Draws parent–child edges on the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js").renderStructureEdges;
      }>;

      "explorer.spa.BaseNodeRenderer": Export<{
        desc: "Default node component. Draws any node as a card.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/base.js").BaseNodeRenderer;
      }>;

      "explorer.spa.createNodeRenderer": Export<{
        desc: "Builds a node renderer wired with the SPA's interaction callbacks.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/index.js").createNodeRenderer;
      }>;

      "explorer.spa.renderBoundaryGroups": Export<{
        desc: "Draws an outline around the nodes that belong to each boundary.";
        type: typeof import("packages/tskb/explorer-app/src/components/BoundaryRenderer.js").renderBoundaryGroups;
      }>;

      "explorer.spa.showNodeSpinner": Export<{
        desc: "Shows a small spinner next to a node.";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js").showNodeSpinner;
      }>;

      "explorer.spa.removeNodeSpinner": Export<{
        desc: "Removes a spinner shown by `showNodeSpinner`.";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js").removeNodeSpinner;
      }>;

      "explorer.spa.DocPanel": Export<{
        desc: "Side panel that shows the selected node's content.";
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
  <Doc explains="How is the explorer SPA structured and how do its layers fit together?">
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
