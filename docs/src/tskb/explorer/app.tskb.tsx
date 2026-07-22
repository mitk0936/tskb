import { type Export, type Module, Doc, H1, P, Flow, Step, Relation, ref } from "tskb";

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
        desc: "Creates the search Web Worker and wires button clicks to send queries and receive ranked matchIds.";
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
      It owns every canvas layer, all UI state, and every callback. {MountExport} is its only public
      method — everything else is private.
    </P>
    <P>
      The one seam worth knowing: {RenderExport} computes nothing itself. It hands all application
      logic to {ComputeRenderStateExport}, then passes the result to the D3 drawing functions.{" "}
      {RenderStateModule} is that boundary between logic and rendering.
    </P>
    <Relation from={RenderExport} to={ComputeRenderStateExport} label="delegates all logic to" />
    <Relation from={OnExpandExport} to={CollapseDescendantsExport} label="delegates collapse to" />
    <P>
      Three ordered paths run through the class, one flow each below. The per-step detail lives in
      each method's <code>desc</code> — <code>pick</code> a step to read it.
    </P>

    <Flow
      name="explorer-app-boot"
      desc="mount() runs its setup phases, then fetches the meta chunk and triggers the first render"
    >
      <Step node={ExplorerAppExport} label="mounted on page load" />
      <Step node={SetupCanvasExport} label="builds the SVG layer stack and wires zoom and pan" />
      <Step node={SetupTooltipsExport} label="mounts the hover and code-preview tooltips" />
      <Step node={SetupRendererExport} label="builds the node renderer and binds its callbacks" />
      <Step node={SetupSearchExport} label="creates the search worker and wires the search input" />
      <Step node={LoadInitialDataExport} label="loads the meta chunk behind the global spinner" />
      <Step node={StoreModule} label="stores the meta chunk and notifies the render subscriber" />
      <Step node={LaneEngineModule} label="first render positions the top-level nodes" />
    </Flow>

    <Flow
      name="explorer-app-render"
      desc="A store update or an interaction calls render(): recompute layout and state, then draw"
    >
      <Step node={RenderExport} label="runs on a store update or an interaction" />
      <Step
        node={ComputeLayoutExport}
        label="positions the visible tree; result cached until it changes"
      />
      <Step
        node={ComputeRenderStateExport}
        label="derives the pure render state from store, layout, and search matches"
      />
      <Step node={EdgeRendererModule} label="draws the lane background bands" />
      <Step node={BuildStructureLinksExport} label="derives the parent–child link pairs" />
      <Step node={RenderStructureEdgesExport} label="redraws the structure edges" />
      <Step node={NodeBaseModule} label="draws node cards and dims non-matching nodes on search" />
    </Flow>

    <Flow
      name="explorer-app-expand"
      desc="onExpand() fetches the chunk if needed, updates the expanded set, and re-renders"
    >
      <Step
        node={NodeBaseModule}
        label="user clicks expand; the node fires the onExpand callback"
      />
      <Step node={OnExpandExport} label="handles the expand, or delegates a collapse" />
      <Step node={ShowNodeSpinnerExport} label="shows a per-node spinner while the chunk loads" />
      <Step node={LoaderModule} label="returns the folder chunk from cache or fetches it" />
      <Step
        node={RemoveNodeSpinnerExport}
        label="removes the spinner whether the load succeeds or fails"
      />
      <Step node={StoreModule} label="stores the folder chunk and notifies subscribers" />
      <Step node={RenderExport} label="re-renders with the newly expanded nodes" />
    </Flow>
  </Doc>
);
