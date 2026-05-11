import { type Export, type Module, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

type ExplorerApp = typeof import("packages/tskb/explorer-app/src/main.js").ExplorerApp;

declare global {
  namespace tskb {
    interface Modules {
      "explorer.spa.main": Module<{
        desc: "Entry point of the explorer SPA.";
        type: typeof import("packages/tskb/explorer-app/src/main.js");
      }>;

      "explorer.spa.render-state": Module<{
        desc: "Pure render state. The boundary between app logic and D3 rendering.";
        type: typeof import("packages/tskb/explorer-app/src/render-state.js");
      }>;
    }

    interface Exports {
      "explorer.spa.ExplorerApp": Export<{
        desc: "Top-level controller for the explorer SPA.";
        type: ExplorerApp;
      }>;

      // ── mount phase ────────────────────────────────────────────────────────

      "explorer.spa.ExplorerApp.mount": Export<{
        desc: "Boots the SPA. Call once on startup.";
        type: InstanceType<ExplorerApp>["mount"];
      }>;

      "explorer.spa.ExplorerApp.setupCanvas": Export<{
        desc: "Creates the SVG layers and wires zoom and pan.";
        type: InstanceType<ExplorerApp>["setupCanvas"];
      }>;

      "explorer.spa.ExplorerApp.setupTooltips": Export<{
        desc: "Sets up the hover tooltip and the code preview popup.";
        type: InstanceType<ExplorerApp>["setupTooltips"];
      }>;

      "explorer.spa.ExplorerApp.setupRenderer": Export<{
        desc: "Builds the node renderer with its interaction callbacks.";
        type: InstanceType<ExplorerApp>["setupRenderer"];
      }>;

      "explorer.spa.ExplorerApp.setupSearch": Export<{
        desc: "Wires the search input to the render loop.";
        type: InstanceType<ExplorerApp>["setupSearch"];
      }>;

      "explorer.spa.ExplorerApp.loadInitialData": Export<{
        desc: "Loads the meta chunk and shows or hides the global spinner.";
        type: InstanceType<ExplorerApp>["loadInitialData"];
      }>;

      "explorer.spa.ExplorerApp.render": Export<{
        desc: "Re-runs the render loop. Computes state, then draws.";
        type: InstanceType<ExplorerApp>["render"];
      }>;

      "explorer.spa.computeRenderState": Export<{
        desc: "Pure function that produces the render state from store, layout, and search query.";
        type: typeof import("packages/tskb/explorer-app/src/render-state.js").computeRenderState;
      }>;

      "explorer.spa.ExplorerApp.onExpand": Export<{
        desc: "Handles expand and collapse for folders and modules.";
        type: InstanceType<ExplorerApp>["onExpand"];
      }>;

      "explorer.spa.ExplorerApp.onTraceLinks": Export<{
        desc: "Hook for tracing edges from a node. Stub today.";
        type: InstanceType<ExplorerApp>["onTraceLinks"];
      }>;

      "explorer.spa.ExplorerApp.collapseDescendants": Export<{
        desc: "Collapses a folder and everything inside it.";
        type: InstanceType<ExplorerApp>["collapseDescendants"];
      }>;

      "explorer.spa.ExplorerApp.prefetchNodeChunk": Export<{
        desc: "Loads the chunks needed to resolve a node, without expanding it on the canvas.";
        type: InstanceType<ExplorerApp>["prefetchNodeChunk"];
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
  <Doc explains="How does the ExplorerApp class boot, render, and respond to interaction?">
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
      desc="A store update or interaction calls ExplorerApp.render(): layout, edges, D3 join, search dim"
    >
      <Step
        node={RenderExport}
        label="triggered by store subscription or a direct call from an interaction handler"
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
        label="D3 enter/update/exit: new node cards appended, merged nodes repositioned, removed nodes fade out; search dim sets 0.15 on non-matching nodes"
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
