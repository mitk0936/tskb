import {
  type Folder,
  type Module,
  type Export,
  type Term,
  Doc,
  H1,
  H2,
  H3,
  P,
  List,
  Li,
  ref,
  Relation,
  Flow,
  Step,
} from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    // ── Folders ──────────────────────────────────────────────────────────────

    interface Folders {
      "tskb.explorer.core": Folder<{
        desc: "CLI-side explorer layer: graph→chunk transform, HTTP server, and static export";
        path: "packages/tskb/src/core/explorer";
      }>;

      "tskb.explorer.app": Folder<{
        desc: "Vite SPA source for the interactive explorer UI. Built separately from the library (npm run build:explorer) and shipped in dist/explorer/";
        path: "packages/tskb/explorer-app";
      }>;

      "tskb.explorer.app.components": Folder<{
        desc: "Node and edge rendering components for the D3 canvas. Each node type implements NodeComponent; edges are drawn by EdgeRenderer";
        path: "packages/tskb/explorer-app/src/components";
      }>;

      "tskb.explorer.app.graph": Folder<{
        desc: "SPA data layer: chunk type registry, type-safe loader with LRU cache";
        path: "packages/tskb/explorer-app/src/graph";
      }>;

      "tskb.explorer.app.layout": Folder<{
        desc: "Lane layout engine: computes SVG positions for structure (d3.tree), docs, and other lanes";
        path: "packages/tskb/explorer-app/src/layout";
      }>;

      "tskb.explorer.app.store": Folder<{
        desc: "Pure graph data store (loaded chunks only). UI state lives outside the store in main.ts";
        path: "packages/tskb/explorer-app/src/store";
      }>;

      "tskb.explorer.app.ui": Folder<{
        desc: "UI shell components: global spinner, per-node spinner, detail panel, node hover tooltip, and code preview popup";
        path: "packages/tskb/explorer-app/src/ui";
      }>;
    }

    // ── CLI-side modules (importable) ─────────────────────────────────────────

    interface Modules {
      "explorer.transform": Module<{
        desc: "Converts KnowledgeGraph into ExplorerChunks: a MetaChunk (root, topFolders, docs, flows, terms) plus one FolderChunk per folder that has modules or sub-folders. Also injects ghost ExplorerNodes for any .ts/.tsx files recorded in folder.children.files that are not declared as modules, making undeclared-but-existing files visible in the UI.";
        type: typeof import("packages/tskb/src/core/explorer/transform.js");
      }>;

      "explorer.server": Module<{
        desc: "Node built-in HTTP server that serves the pre-built SPA assets and generates chunk JSON responses on demand. Reads graph.json once and caches all chunks in memory.";
        type: typeof import("packages/tskb/src/core/explorer/server.js");
      }>;

      "explorer.export": Module<{
        desc: "Copies pre-built SPA assets to an output directory and writes all chunk JSON files alongside them, producing a fully self-contained static explorer";
        type: typeof import("packages/tskb/src/core/explorer/export.js");
      }>;

      "cli.commands.explore": Module<{
        desc: "Entry point for `tskb explore`: loads graph.json, then either serves locally or exports static files depending on --export flag";
        type: typeof import("packages/tskb/src/cli/commands/explore.js");
      }>;

      // ── SPA modules (declared without type — browser DOM types not in docs build)

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

    // ── Key exports ───────────────────────────────────────────────────────────

    interface Exports {
      "explorer.transformGraph": Export<{
        desc: "Transforms a KnowledgeGraph into ExplorerChunks. Recursively builds folder chunks for every folder with modules or sub-folders; computes _hasChildren flags.";
        type: typeof import("packages/tskb/src/core/explorer/transform.js").transformGraph;
      }>;

      "explorer.serveExplorer": Export<{
        desc: "Starts a Node http server that serves the pre-built SPA + chunk API. Resolves SPA assets via import.meta.url so it works after npm pack.";
        type: typeof import("packages/tskb/src/core/explorer/server.js").serveExplorer;
      }>;

      "explorer.exportExplorer": Export<{
        desc: "Copies SPA assets and writes chunk JSON files to an output directory. The SPA fetches chunks via relative ./chunks/*.json paths so it works under file://.";
        type: typeof import("packages/tskb/src/core/explorer/export.js").exportExplorer;
      }>;

      "explorer.explore": Export<{
        desc: "CLI command handler: finds graph.json, branches to serve or export based on --export flag";
        type: typeof import("packages/tskb/src/cli/commands/explore.js").explore;
      }>;
    }

    // ── Terms ─────────────────────────────────────────────────────────────────

    interface Terms {
      knowledgeChunk: Term<"An on-demand JSON fragment of the knowledge graph. meta.json contains root folder, top-level folder summaries, docs, flows, and terms. folder-{id}.json contains modules, exports, sub-folders, and import edges for one folder.">;
      explorerLane: Term<"A horizontal section of the explorer SVG canvas. Three lanes stack vertically: Structure (code hierarchy, d3.tree), Docs (priority-ordered horizontal list), and Terms/Flows. Each lane has a labeled background band.">;
      nodeComponent: Term<"Interface for rendering a node type in the D3 canvas: enter() appends SVG elements, update() repositions them, anchor() returns edge connection points, getSize() returns bounding box. Implemented by BaseNodeRenderer; override per type.">;
      lruChunkCache: Term<"Bounded LRU cache inside ChunkLoader (max 50 entries). Map insertion order is used for O(1) LRU: on get, entry is deleted and re-inserted; on set overflow, oldest key is evicted. Chunks are immutable so no invalidation is needed.">;
      explorerStaticExport: Term<"Self-contained static export produced by `tskb explore --export`. Contains the pre-built SPA (index.html + hashed JS chunks) and all graph chunk JSON files. Works offline via file:// because the SPA uses relative fetch paths.">;
      ghostNode: Term<"A placeholder ExplorerNode with detail._ghost = 'true'. Ghost nodes represent filesystem files or unexpanded folder slots that are not declared in the knowledge graph. They render as dashed transparent cards with only a filename label, and their parent→child edges are dashed. Injected by transform.ts (from folder.children.files) and by lane-engine.ts (for collapsed folders with _childCount > 0).">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ExplorerCoreFolder = ref as tskb.Folders["tskb.explorer.core"];
const ExplorerAppFolder = ref as tskb.Folders["tskb.explorer.app"];
const ExplorerComponentsFolder = ref as tskb.Folders["tskb.explorer.app.components"];
const ExplorerGraphFolder = ref as tskb.Folders["tskb.explorer.app.graph"];
const ExplorerLayoutFolder = ref as tskb.Folders["tskb.explorer.app.layout"];
const ExplorerStoreFolder = ref as tskb.Folders["tskb.explorer.app.store"];

const TransformModule = ref as tskb.Modules["explorer.transform"];
const ServerModule = ref as tskb.Modules["explorer.server"];
const ExportModule = ref as tskb.Modules["explorer.export"];
const ExploreCommandModule = ref as tskb.Modules["cli.commands.explore"];

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

const TransformGraphExport = ref as tskb.Exports["explorer.transformGraph"];
const ServeExplorerExport = ref as tskb.Exports["explorer.serveExplorer"];
const ExportExplorerExport = ref as tskb.Exports["explorer.exportExplorer"];
const ExploreExport = ref as tskb.Exports["explorer.explore"];

const ChunkTerm = ref as tskb.Terms["knowledgeChunk"];
const LaneTerm = ref as tskb.Terms["explorerLane"];
const NodeComponentTerm = ref as tskb.Terms["nodeComponent"];
const LruCacheTerm = ref as tskb.Terms["lruChunkCache"];
const StaticExportTerm = ref as tskb.Terms["explorerStaticExport"];
const GhostNodeTerm = ref as tskb.Terms["ghostNode"];

const GraphFinderModule = ref as tskb.Modules["cli.utils.graph-finder"];
const CliBuildExport = ref as tskb.Exports["cli.build"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="tskb Explorer: interactive visual graph browser opened via `tskb explore`. Architecture, data flow, SPA layout, and extension points."
    priority="essential"
  >
    <H1>Explorer</H1>
    <P>
      The explorer is a D3-powered SPA that renders the knowledge graph as a visual, interactive
      diagram. It opens via <code>tskb explore</code> (local HTTP server) or exports to a
      self-contained static folder via <code>tskb explore --export</code> ({StaticExportTerm}).
    </P>
    <P>
      The implementation splits into two layers: the CLI-side layer in {ExplorerCoreFolder} (graph
      transform, server, static export) and the Vite SPA in {ExplorerAppFolder} (D3 canvas, chunk
      loading, layout, node components).
    </P>

    <H2>CLI layer</H2>
    <P>
      {ExploreCommandModule} is the command entry point. It locates <code>graph.json</code> via{" "}
      {GraphFinderModule}, then either calls {ServeExplorerExport} or {ExportExplorerExport}.
    </P>
    <P>
      {TransformModule} converts the flat {ref as tskb.Terms["graph"]} into {ChunkTerm}s via{" "}
      {TransformGraphExport}. The transform recurses through all folders, building one{" "}
      <code>folder-&#123;id&#125;.json</code> per folder that has direct modules or sub-folders. The
      root and top-level folder summaries go into <code>meta.json</code> alongside all doc, flow,
      term, and external nodes.
    </P>
    <P>
      {ServerModule} uses only Node built-in <code>http</code> — no external server dependency. It
      caches all chunk JSON strings in memory after the first transform, so subsequent chunk
      requests are pure string writes.
    </P>
    <P>
      {ExportModule} copies the pre-built SPA assets from <code>dist/explorer/</code> to the output
      directory and writes chunk JSON files alongside them. The SPA uses relative{" "}
      <code>./chunks/*.json</code> fetch paths so it works under <code>file://</code> without a
      server.
    </P>

    <H2>SPA architecture</H2>
    <P>
      The SPA is built with Vite (D3 in a separate vendor chunk) and lives in {ExplorerAppFolder}.
      It is pre-built into <code>dist/explorer/</code> and shipped inside the tskb npm package.
    </P>

    <H3>Data layer</H3>
    <P>
      {ChunkTypesModule} defines the {ChunkTerm} discriminated union ({" "}
      <code>MetaChunk | FolderChunk</code>) and the <code>ChunkRegistry</code> map. Adding a new
      chunk kind requires only changing this file.
    </P>
    <P>
      {LoaderModule} provides <code>ChunkLoader</code>: a generic <code>load(kind, ...args)</code>{" "}
      method whose return type is inferred from <code>ChunkRegistry[K]</code>. It deduplicates
      in-flight requests and uses a {LruCacheTerm} (max 50 entries).
    </P>
    <P>
      {StoreModule} holds only graph data (meta chunk, folder chunks map). UI state — the expanded
      node set, selected node, and search query — lives as plain variables in {MainModule} and is
      passed to layout and rendering functions explicitly. The store exposes{" "}
      <code>subscribe(listener)</code> for reactive re-render.
    </P>

    <Relation from={StoreModule} to={ChunkTypesModule} label="stores chunks typed by" />
    <Relation from={LoaderModule} to={ChunkTypesModule} label="types fetch results via" />
    <Relation from={MainModule} to={StoreModule} label="subscribes to" />

    <H3>Layout — three lanes</H3>
    <P>
      {LaneEngineModule} computes all SVG positions in a single pass. The canvas has three{" "}
      {LaneTerm}s stacked vertically:
    </P>
    <List>
      <Li>
        <strong>Structure</strong> — builds a <code>d3.hierarchy</code> from the visible tree (root
        → expanded folders → modules → exports, including sub-folder nesting). Runs{" "}
        <code>d3.tree().nodeSize()</code> for left-to-right positioning; the tree's{" "}
        <code>node.y</code> maps to SVG x (depth) and <code>node.x</code> maps to SVG y (sibling
        spread).
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
      On every expand or collapse, {MainModule} calls <code>computeLayout()</code> and fully
      re-renders the D3 selection with enter/update/exit.
    </P>

    <H3>Node components</H3>
    <P>
      {NodeBaseModule} defines the {NodeComponentTerm} interface and <code>BaseNodeRenderer</code> —
      the default renderer for all node types. Each node is an SVG <code>&lt;g&gt;</code> containing
      a rounded-rect card, type icon, label, description, edge-count badge, a <code>&lt;&gt;</code>{" "}
      code preview bubble (top-center), and a <code>+</code> expand bubble (right edge).{" "}
      {GhostNodeTerm}s render as dashed transparent placeholders showing only their filename — used
      to hint at filesystem files not yet declared in the graph.
    </P>
    <P>
      {EdgeRendererModule} derives parent→child links from <code>parentId</code> fields and draws
      them as horizontal cubic-bezier SVG paths. Ghost links render with a dashed stroke and reduced
      opacity. It also renders the lane background bands.
    </P>

    <H3>UI shell</H3>
    <P>
      {SpinnerModule} provides a full-screen global spinner (shown while meta.json loads) and a
      per-node inline spinner (shown while a folder chunk is fetching).
    </P>
    <P>
      {DetailPanelModule} is a slide-in panel mounted outside the SVG. It shows all fields of the
      selected node and is opened by <code>onSelect</code>, closed by ESC or the × button.
    </P>
    <P>
      {NodeTooltipModule} appears on hover, anchored to the node's right-center SVG position.{" "}
      {CodeTooltipModule} is a click-toggled code preview popup anchored to the node's top-center
      SVG position. Both receive <code>updateXxxTransform()</code> calls from {MainModule} on every
      D3 zoom event so they reposition to track their anchor nodes as the canvas pans and zooms.
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

    <H2>Build integration</H2>
    <P>
      <code>npm run build:explorer</code> runs Vite, outputting to <code>dist/explorer/</code>.{" "}
      <code>npm run build:lib</code> runs <code>tsc</code>, outputting to <code>dist/</code>. The
      full <code>npm run build</code> runs explorer first, then lib — so the SPA assets are inside{" "}
      <code>dist/</code> when the package is published.
    </P>
    <P>
      During development, <code>npm run dev:explorer</code> starts Vite's HMR dev server against a
      fixed <code>chunks/</code> directory. The CLI <code>build:lib</code> must be run at least once
      so the <code>dist/</code> server code exists.
    </P>

    <H2>Flows</H2>

    <Flow
      name="explorer-serve-flow"
      desc="tskb explore: CLI finds graph, transforms chunks, starts HTTP server, browser loads SPA and fetches chunks on demand"
      priority="essential"
    >
      <Step node={ExploreExport} label="Reads graph.json, branches on --export flag" />
      <Step
        node={TransformGraphExport}
        label="Converts KnowledgeGraph into MetaChunk + FolderChunks, caches in memory"
      />
      <Step
        node={ServeExplorerExport}
        label="Starts http server serving SPA assets + /chunks/*.json routes"
      />
      <Step node={MainModule} label="Browser fetches meta.json, mounts SVG canvas with zoom/pan" />
      <Step
        node={LaneEngineModule}
        label="computeLayout() positions all visible nodes across three lanes"
      />
      <Step node={NodeBaseModule} label="D3 enter/update renders node cards into SVG groups" />
    </Flow>

    <Flow
      name="explorer-expand-flow"
      desc="User expands a folder node: chunk is fetched, store updated, layout recomputed, SVG re-rendered"
      priority="supplementary"
    >
      <Step node={NodeBaseModule} label="User clicks ▶ expand button; onExpand handler fires" />
      <Step
        node={LoaderModule}
        label="ChunkLoader.load('folder', id) — returns cache hit or fetches /chunks/folder-{id}.json"
      />
      <Step
        node={StoreModule}
        label="store.addFolderChunk() stores chunk; expanded set updated in main.ts"
      />
      <Step
        node={LaneEngineModule}
        label="computeLayout() rebuilds d3.hierarchy with expanded folder's modules"
      />
      <Step
        node={EdgeRendererModule}
        label="buildStructureLinks() + renderStructureEdges() redraws parent→child bezier paths"
      />
      <Step
        node={NodeBaseModule}
        label="D3 enter/update/exit adds new node cards, removes collapsed ones"
      />
    </Flow>
  </Doc>
);
