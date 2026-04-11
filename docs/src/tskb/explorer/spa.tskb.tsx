import {
  type Module,
  type Export,
  Doc,
  H1,
  H2,
  H3,
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
        desc: "SPA entry point: creates D3 SVG canvas with zoom/pan, fetches meta.json, wires expand/select/trace handlers, subscribes to store, and drives the render loop. On every zoom event, propagates the D3 transform to both tooltip modules so they reposition to track their anchor nodes.";
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

      "explorer.spa.edge-renderer": Module<{
        desc: "buildStructureLinks() derives parent→child links from parentId, marking ghost links via detail._ghost; renderStructureEdges() draws cubic-bezier SVG paths (dashed + lower opacity for ghost links); renderLaneBands() renders lane background bands with labels";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js");
      }>;

      "explorer.spa.spinner": Module<{
        desc: "Global and per-node spinner helpers: showGlobalSpinner/hideGlobalSpinner overlay a full-screen loader; showNodeSpinner/removeNodeSpinner attach a small SVG spinner next to a node while its chunk is loading";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js");
      }>;

      "explorer.spa.detail-panel": Module<{
        desc: "Slide-in detail panel mounted in the DOM outside the SVG. Shows node id, type, description, path, and all detail fields (morphology, imports, signature). Opened by onSelect, closed by ESC or the × button.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DetailPanel.js");
      }>;

      "explorer.spa.node-tooltip": Module<{
        desc: "Hover tooltip anchored to the node's right-center SVG position. Shows a coloured dot, node name, monospace path, and description. Receives updateNodeTooltipTransform() calls from main.ts on every zoom event so it repositions to track the node. Uses mouseover/mouseout bubbling with relatedTarget boundary guards to avoid flicker on child SVG elements.";
        type: typeof import("packages/tskb/explorer-app/src/ui/NodeTooltip.js");
      }>;

      "explorer.spa.code-tooltip": Module<{
        desc: "Toggle-based code preview popup for module nodes. Click the <> bubble to show/hide; clicking the same node again dismisses it; clicking outside also dismisses. Renders morphology lines with an inline TypeScript tokenizer (no runtime deps) for syntax highlighting, prepended by import lines with a blank-line separator.";
        type: typeof import("packages/tskb/explorer-app/src/ui/CodeTooltip.js");
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
const EdgeRendererModule = ref as tskb.Modules["explorer.spa.edge-renderer"];
const SpinnerModule = ref as tskb.Modules["explorer.spa.spinner"];
const DetailPanelModule = ref as tskb.Modules["explorer.spa.detail-panel"];
const NodeTooltipModule = ref as tskb.Modules["explorer.spa.node-tooltip"];
const CodeTooltipModule = ref as tskb.Modules["explorer.spa.code-tooltip"];

const ChunkLoaderExport = ref as tskb.Exports["explorer.spa.ChunkLoader"];
const GraphStoreExport = ref as tskb.Exports["explorer.spa.GraphStore"];
const ComputeLayoutExport = ref as tskb.Exports["explorer.spa.computeLayout"];
const BuildStructureLinksExport = ref as tskb.Exports["explorer.spa.buildStructureLinks"];
const RenderStructureEdgesExport = ref as tskb.Exports["explorer.spa.renderStructureEdges"];
const BaseNodeRendererExport = ref as tskb.Exports["explorer.spa.BaseNodeRenderer"];

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
      {GraphStoreExport} in {StoreModule} holds only graph data (meta chunk, folder chunks map). UI
      state — the expanded node set, selected node, and search query — lives as plain variables in{" "}
      {MainModule} and is passed to layout and rendering functions explicitly. The store exposes{" "}
      <code>subscribe(listener)</code> for reactive re-render.
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
      {NodeBaseModule} defines the {NodeComponentTerm} interface and {BaseNodeRendererExport} — the
      default renderer for all node types. Each node is an SVG <code>&lt;g&gt;</code> containing a
      rounded-rect card, type icon, label, description, edge-count badge, a <code>&lt;&gt;</code>{" "}
      code preview bubble (top-center), and a <code>+</code> expand bubble (right edge).{" "}
      {GhostNodeTerm}s render as dashed transparent placeholders showing only their filename.
    </P>
    <P>
      {EdgeRendererModule} derives parent→child links via {BuildStructureLinksExport} and draws them
      as horizontal cubic-bezier SVG paths via {RenderStructureEdgesExport}. Ghost links (where
      either endpoint has <code>detail._ghost = 'true'</code>) render with a dashed stroke and
      reduced opacity. It also renders the labeled background bands for each lane.
    </P>

    <Relation from={NodeBaseModule} to={LaneEngineModule} label="reads NODE_SIZES from" />
    <Relation from={EdgeRendererModule} to={LaneEngineModule} label="reads LaneLayout from" />
    <Relation from={MainModule} to={LaneEngineModule} label="calls computeLayout on each render" />
    <Relation from={MainModule} to={NodeBaseModule} label="calls enter/update on node selections" />
    <Relation from={MainModule} to={EdgeRendererModule} label="calls renderStructureEdges" />
    <Relation from={MainModule} to={NodeTooltipModule} label="propagates zoom transform to" />
    <Relation from={MainModule} to={CodeTooltipModule} label="propagates zoom transform to" />
    <Relation from={NodeBaseModule} to={NodeTooltipModule} label="triggers show/hide on hover" />
    <Relation from={NodeBaseModule} to={CodeTooltipModule} label="triggers toggle on <> click" />

    <H2>UI shell</H2>
    <P>
      {SpinnerModule} provides a full-screen global spinner (shown while <code>meta.json</code>{" "}
      loads) and a per-node inline spinner (shown while a folder chunk is fetching).
    </P>
    <P>
      {DetailPanelModule} is a slide-in panel mounted outside the SVG. It shows all fields of the
      selected node (id, type, description, path, morphology, imports, signature) and is opened by{" "}
      <code>onSelect</code>, closed by ESC or the × button.
    </P>
    <P>
      {NodeTooltipModule} appears on hover, anchored to the node's right-center SVG position.{" "}
      {CodeTooltipModule} is a click-toggled code preview popup anchored to the node's top-center
      SVG position. Both receive <code>updateXxxTransform()</code> calls from {MainModule} on every
      D3 zoom event so they reposition to track their anchor nodes as the canvas pans and zooms.
    </P>

    <Flow
      name="explorer-expand-flow"
      desc="User expands a folder node: chunk is fetched, store updated, layout recomputed, SVG re-rendered"
      priority="supplementary"
    >
      <Step node={NodeBaseModule} label="User clicks ▶ expand button; onExpand handler fires" />
      <Step
        node={LoaderModule}
        label="ChunkLoader.load('folder', id) — cache hit or fetches /chunks/folder-{id}.json"
      />
      <Step
        node={StoreModule}
        label="store.addFolderChunk() stores chunk; expanded set updated in main.ts"
      />
      <Step
        node={ComputeLayoutExport}
        label="Rebuilds d3.hierarchy with expanded folder's modules and recomputes all SVG positions"
      />
      <Step
        node={BuildStructureLinksExport}
        label="Derives new parent→child link list from updated parentId fields"
      />
      <Step
        node={RenderStructureEdgesExport}
        label="Redraws parent→child cubic-bezier SVG paths; ghost links rendered dashed"
      />
      <Step
        node={NodeBaseModule}
        label="D3 enter/update/exit adds new node cards, removes collapsed ones"
      />
    </Flow>
  </Doc>
);
