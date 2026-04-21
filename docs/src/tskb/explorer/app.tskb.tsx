import { type Export, type Module, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

type ExplorerApp = typeof import("packages/tskb/explorer-app/src/main.js").ExplorerApp;

declare global {
  namespace tskb {
    interface Modules {
      "explorer.spa.render-state": Module<{
        desc: "Pure render state — coordinator-facing boundary between application logic and D3 rendering";
        type: typeof import("packages/tskb/explorer-app/src/render-state.js");
      }>;
    }

    interface Exports {
      "explorer.spa.ExplorerApp": Export<{
        desc: "Top-level SPA controller class. The only public entry point is mount() — everything else is private. Owns the D3 canvas layers, UI state, and the render loop.";
        type: ExplorerApp;
      }>;

      // ── mount phase ────────────────────────────────────────────────────────

      "explorer.spa.ExplorerApp.mount": Export<{
        desc: "Public entry point. Calls the four setup methods in order (setupCanvas, setupTooltips, setupRenderer, setupSearch), subscribes to store changes, then awaits loadInitialData.";
        type: InstanceType<ExplorerApp>["mount"];
      }>;

      "explorer.spa.ExplorerApp.setupCanvas": Export<{
        desc: "Creates the D3 SVG layer stack (zoom-layer → lane-bg-layer / boundary-layer / edge-layer / node-layer), configures zoom/pan with tooltip transform propagation.";
        type: InstanceType<ExplorerApp>["setupCanvas"];
      }>;

      "explorer.spa.ExplorerApp.setupTooltips": Export<{
        desc: "Mounts the node hover tooltip and the code preview popup into the DOM, both anchored to the SVG element.";
        type: InstanceType<ExplorerApp>["setupTooltips"];
      }>;

      "explorer.spa.ExplorerApp.setupRenderer": Export<{
        desc: "Constructs the BaseNodeRenderer via createNodeRenderer, passing bound callbacks (onExpand, onSelect, onTraceLinks, hasChildren, code preview handler).";
        type: InstanceType<ExplorerApp>["setupRenderer"];
      }>;

      "explorer.spa.ExplorerApp.setupSearch": Export<{
        desc: "Wires the search input 'input' event to update searchQuery and call render().";
        type: InstanceType<ExplorerApp>["setupSearch"];
      }>;

      "explorer.spa.ExplorerApp.loadInitialData": Export<{
        desc: "Shows global spinner, fetches meta.json via loader.load('meta'), calls store.loadMeta() on success. On failure, replaces the spinner with an error message.";
        type: InstanceType<ExplorerApp>["loadInitialData"];
      }>;

      "explorer.spa.ExplorerApp.render": Export<{
        desc: "Coordinator: calls computeLayout if the layout is dirty, delegates all pure computation to computeRenderState, then calls the D3 rendering functions in order. Contains no application logic — only orchestration.";
        type: InstanceType<ExplorerApp>["render"];
      }>;

      "explorer.spa.computeRenderState": Export<{
        desc: "Pure render state computation — derives allNodes, canvasW, structureLinks, relationLinks, and matchIds from the store, layout, and search query. No D3 or DOM access. The boundary between coordinator logic and D3 rendering.";
        type: typeof import("packages/tskb/explorer-app/src/render-state.js").computeRenderState;
      }>;

      "explorer.spa.ExplorerApp.onExpand": Export<{
        desc: "Handles folder expand/collapse and module expand/collapse. For folder expand: shows node spinner, fetches chunk if not cached, removes spinner in finally, adds id to expanded set, calls render(). For folder collapse: removes id and all descendants from expanded set via collapseDescendants.";
        type: InstanceType<ExplorerApp>["onExpand"];
      }>;

      "explorer.spa.ExplorerApp.onTraceLinks": Export<{
        desc: "MVP stub: logs the node id and edge count. Intended for an animated edge tracer in a future iteration.";
        type: InstanceType<ExplorerApp>["onTraceLinks"];
      }>;

      "explorer.spa.ExplorerApp.collapseDescendants": Export<{
        desc: "Recursively removes all sub-folders and modules of a given folder from the expanded set. Called by onExpand on collapse before render().";
        type: InstanceType<ExplorerApp>["collapseDescendants"];
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ExplorerAppExport = ref as tskb.Exports["explorer.spa.ExplorerApp"];
const MountExport = ref as tskb.Exports["explorer.spa.ExplorerApp.mount"];
const SetupCanvasExport = ref as tskb.Exports["explorer.spa.ExplorerApp.setupCanvas"];
const SetupTooltipsExport = ref as tskb.Exports["explorer.spa.ExplorerApp.setupTooltips"];
const SetupRendererExport = ref as tskb.Exports["explorer.spa.ExplorerApp.setupRenderer"];
const SetupSearchExport = ref as tskb.Exports["explorer.spa.ExplorerApp.setupSearch"];
const LoadInitialDataExport = ref as tskb.Exports["explorer.spa.ExplorerApp.loadInitialData"];
const RenderExport = ref as tskb.Exports["explorer.spa.ExplorerApp.render"];
const OnExpandExport = ref as tskb.Exports["explorer.spa.ExplorerApp.onExpand"];
const CollapseDescendantsExport =
  ref as tskb.Exports["explorer.spa.ExplorerApp.collapseDescendants"];

const MainModule = ref as tskb.Modules["explorer.spa.main"];
const StoreModule = ref as tskb.Modules["explorer.spa.store"];
const LoaderModule = ref as tskb.Modules["explorer.spa.loader"];
const LaneEngineModule = ref as tskb.Modules["explorer.spa.lane-engine"];
const NodeBaseModule = ref as tskb.Modules["explorer.spa.node-base"];
const EdgeRendererModule = ref as tskb.Modules["explorer.spa.edge-renderer"];

const ComputeLayoutExport = ref as tskb.Exports["explorer.spa.computeLayout"];
const ComputeRenderStateExport = ref as tskb.Exports["explorer.spa.computeRenderState"];
const RenderStateModule = ref as tskb.Modules["explorer.spa.render-state"];
const BuildStructureLinksExport = ref as tskb.Exports["explorer.spa.buildStructureLinks"];
const RenderStructureEdgesExport = ref as tskb.Exports["explorer.spa.renderStructureEdges"];
const ShowNodeSpinnerExport = ref as tskb.Exports["explorer.spa.showNodeSpinner"];
const RemoveNodeSpinnerExport = ref as tskb.Exports["explorer.spa.removeNodeSpinner"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="ExplorerApp class: boot sequence, render loop, and interaction handlers">
    <H1>ExplorerApp</H1>
    <P>
      {ExplorerAppExport} in {MainModule} is the single top-level controller for the explorer SPA.
      All canvas layers, UI state, and callbacks are owned by the class instance. The only public
      surface is {MountExport} — everything else is private, wired internally via callbacks.
    </P>

    <H2>Boot sequence</H2>
    <P>
      {MountExport} runs four synchronous setup methods then awaits data. {SetupCanvasExport}{" "}
      creates the SVG layer stack and wires zoom/pan. {SetupTooltipsExport} mounts hover and code
      tooltips. {SetupRendererExport} constructs the node renderer with bound interaction callbacks.{" "}
      {SetupSearchExport} wires the search input. {LoadInitialDataExport} fetches{" "}
      <code>meta.json</code> and calls <code>store.loadMeta()</code>, which notifies the render
      subscriber and triggers the first {RenderExport}.
    </P>

    <H2>Render loop</H2>
    <P>
      {RenderExport} is a pure coordinator: it recomputes the layout when dirty, delegates all
      application logic to {ComputeRenderStateExport} in {RenderStateModule}, then passes the result
      straight to the D3 rendering functions. No computation happens inside {RenderExport} itself —
      the boundary between logic and rendering is {RenderStateModule}.
    </P>

    <H2>Interaction handlers</H2>
    <P>
      {OnExpandExport} handles folder and module expand/collapse. For folder expand it calls{" "}
      {ShowNodeSpinnerExport}, fetches via the loader, calls {RemoveNodeSpinnerExport} in{" "}
      <code>finally</code>, then updates the expanded set and calls {RenderExport}. Collapse
      delegates to {CollapseDescendantsExport} to recursively clear all descendants from the
      expanded set.
    </P>

    <Flow
      name="explorer-app-boot"
      desc="ExplorerApp.mount(): four setup phases then meta fetch that triggers the first render"
    >
      <Step node={ExplorerAppExport} label="new ExplorerApp().mount() called on page load" />
      <Step
        node={SetupCanvasExport}
        label="Appends zoom-layer → lane-bg-layer / boundary-layer / edge-layer / node-layer; configures d3.zoom with tooltip transform propagation"
      />
      <Step
        node={SetupTooltipsExport}
        label="mountNodeTooltip() and mountCodeTooltip() attach DOM tooltip elements anchored to the SVG"
      />
      <Step
        node={SetupRendererExport}
        label="createNodeRenderer() wires onExpand / onSelect / onTraceLinks / hasChildren / code preview callbacks to ExplorerApp instance methods"
      />
      <Step
        node={SetupSearchExport}
        label="Search input 'input' event updates searchQuery and calls render()"
      />
      <Step
        node={LoadInitialDataExport}
        label="loader.load('meta') fetches /chunks/meta.json; global spinner shown while pending"
      />
      <Step
        node={StoreModule}
        label="store.loadMeta() stores the chunk and notifies the render subscriber"
      />
      <Step
        node={LaneEngineModule}
        label="First render(): computeLayout positions top-folder nodes across the Structure lane"
      />
    </Flow>

    <Flow
      name="explorer-app-render"
      desc="ExplorerApp.render(): layout → edges → D3 enter/update/exit → search dim"
    >
      <Step
        node={RenderExport}
        label="Triggered by store subscription or direct call from interaction handler"
      />
      <Step
        node={ComputeLayoutExport}
        label="computeLayout(store, expanded): builds d3.hierarchy from visible tree, runs d3.tree for left-to-right positions. Result cached until layoutDirty is set."
      />
      <Step
        node={ComputeRenderStateExport}
        label="computeRenderState(store, layout, searchQuery): derives allNodes, canvasW, structureLinks, relationLinks, matchIds. Pure — no D3."
      />
      <Step
        node={EdgeRendererModule}
        label="renderLaneBands(): draws labeled background bands for Structure and Externals lanes"
      />
      <Step
        node={BuildStructureLinksExport}
        label="buildStructureLinks(structureNodes): derives parent→child StructureLink pairs from parentId fields"
      />
      <Step
        node={RenderStructureEdgesExport}
        label="renderStructureEdges(): redraws cubic-bezier SVG paths; ghost links get dashed stroke"
      />
      <Step
        node={NodeBaseModule}
        label="D3 enter: new <g.node> elements appended; renderer.enter() initialises rect, icon, label, badge, expand bubble"
      />
      <Step
        node={NodeBaseModule}
        label="D3 update: renderer.update() repositions and reskins all merged nodes"
      />
      <Step
        node={NodeBaseModule}
        label="D3 exit: removed nodes fade opacity→0 and translate +8px before removal; search dim sets 0.15 on non-matching nodes"
      />
    </Flow>

    <Flow
      name="explorer-app-expand"
      desc="ExplorerApp.onExpand(): fetch chunk if needed, update expanded set, re-render"
    >
      <Step
        node={NodeBaseModule}
        label="User clicks + button; BaseNodeRenderer fires the onExpand callback"
      />
      <Step
        node={OnExpandExport}
        label="If already expanded: collapseDescendants() clears the subtree, calls render()"
      />
      <Step
        node={ShowNodeSpinnerExport}
        label="If chunk not cached: showNodeSpinner() appends animated SVG ring next to the node"
      />
      <Step
        node={LoaderModule}
        label="loader.load('folder', id): cache hit or fetches /chunks/folder-{sanitizedId}.json"
      />
      <Step
        node={RemoveNodeSpinnerExport}
        label="removeNodeSpinner() called in finally — always removes spinner whether fetch succeeded or failed"
      />
      <Step
        node={StoreModule}
        label="store.loadFolderChunk() stores chunk and notifies subscribers"
      />
      <Step
        node={RenderExport}
        label="render() called after expanded set update — new nodes enter, layout recomputed"
      />
    </Flow>
  </Doc>
);
