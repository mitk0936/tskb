import { type Module, type Export, Doc, H1, H2, P, Flow, Step, Relation, Snippet, ref } from "tskb";
import { panelRouter, RefsView } from "packages/tskb/explorer-app/src/router/index.js";
import { DocPanel } from "packages/tskb/explorer-app/src/ui/DocPanel.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

type Router = typeof import("packages/tskb/explorer-app/src/router/Router.js").Router;

declare global {
  namespace tskb {
    interface Modules {
      "explorer.spa.doc-panel": Module<{
        desc: "Slide-in side panel host. Owns the chrome and renders whichever view the router has on top.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DocPanel.js");
      }>;

      "explorer.spa.router": Module<{
        desc: "Panel router. Owns a stack of views and syncs the top of the stack to location.hash.";
        type: typeof import("packages/tskb/explorer-app/src/router/Router.js");
      }>;

      "explorer.spa.router-types": Module<{
        desc: "Shared types for panel views and router.";
        type: typeof import("packages/tskb/explorer-app/src/router/types.js");
      }>;

      "explorer.spa.router-index": Module<{
        desc: "Public re-exports of the panel router module.";
        type: typeof import("packages/tskb/explorer-app/src/router/index.js");
      }>;

      "explorer.spa.refs-view": Module<{
        desc: "Panel view listing every doc or flow that references a given node.";
        type: typeof import("packages/tskb/explorer-app/src/router/views/RefsView.js");
      }>;

      "explorer.spa.accordion": Module<{
        desc: "HTML builder for the docs/flows accordion shared across panel views.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/Accordion.js");
      }>;

      "explorer.spa.ref-links": Module<{
        desc: "Wires hover, click and prefetch behavior on a.tskb-ref anchors inside panel views.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/RefLinks.js");
      }>;

      "explorer.spa.types": Module<{
        desc: "Shared types for the explorer SPA — node shapes, link kinds, and panel view callbacks.";
        type: typeof import("packages/tskb/explorer-app/src/types.js");
      }>;
    }

    interface Exports {
      "explorer.spa.DocPanel": Export<{
        desc: "Side panel shell. Subscribes to the router and delegates rendering entirely to the active view.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DocPanel.js").DocPanel;
      }>;

      "explorer.spa.Router": Export<{
        desc: "Panel router class. Manages a view stack and optional location.hash sync.";
        type: Router;
      }>;

      "explorer.spa.Router.registerView": Export<{
        desc: "Registers a view class and its deps as a factory for hash restoration. The factory is only used when restoring a view from a URL fragment — normal navigation calls push() directly.";
        type: InstanceType<Router>["registerView"];
      }>;

      "explorer.spa.Router.init": Export<{
        desc: "Optionally starts location.hash sync and restores any view encoded in the current hash.";
        type: InstanceType<Router>["init"];
      }>;

      "explorer.spa.Router.push": Export<{
        desc: "Pushes a view instance onto the stack, notifies subscribers, and writes the route to the URL hash. Skips identical-route pushes.";
        type: InstanceType<Router>["push"];
      }>;

      "explorer.spa.Router.back": Export<{
        desc: "Pops the top view off the stack, notifies subscribers, and rewrites the URL hash.";
        type: InstanceType<Router>["back"];
      }>;

      "explorer.spa.Router.close": Export<{
        desc: "Empties the stack, notifies subscribers, and clears the URL hash.";
        type: InstanceType<Router>["close"];
      }>;

      "explorer.spa.Router.refresh": Export<{
        desc: "Re-notifies subscribers without changing the stack. Used after the store loads new chunks so a hash-restored view repaints with real data.";
        type: InstanceType<Router>["refresh"];
      }>;

      "explorer.spa.panelRouter": Export<{
        desc: "Default Router instance shared across the SPA.";
        type: typeof import("packages/tskb/explorer-app/src/router/Router.js").panelRouter;
      }>;

      "explorer.spa.RefsView": Export<{
        desc: "View that lists docs or flows referencing a given node. Instantiated per navigation with nodeId, kind, and deps.";
        type: typeof import("packages/tskb/explorer-app/src/router/views/RefsView.js").RefsView;
      }>;

      "explorer.spa.renderAccordion": Export<{
        desc: "Builds the docs/flows accordion HTML.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/Accordion.js").renderAccordion;
      }>;

      "explorer.spa.wireRefs": Export<{
        desc: "Attaches hover, click and prefetch handlers to every a.tskb-ref under a root element.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/RefLinks.js").wireRefs;
      }>;

      "explorer.spa.NodeRefHooks": Export<{
        desc: "Callbacks the host gives to panel views for graph lookups and navigation side effects.";
        type: import("packages/tskb/explorer-app/src/types.js").NodeRefHooks;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const DocPanelModule = ref as tskb.Modules["explorer.spa.doc-panel"];
const RouterModule = ref as tskb.Modules["explorer.spa.router"];
const RouterTypesModule = ref as tskb.Modules["explorer.spa.router-types"];
const RefsViewModule = ref as tskb.Modules["explorer.spa.refs-view"];
const AccordionModule = ref as tskb.Modules["explorer.spa.accordion"];
const RefLinksModule = ref as tskb.Modules["explorer.spa.ref-links"];
const DomTooltipModule = ref as tskb.Modules["explorer.spa.dom-tooltip"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];

const DocPanelExport = ref as tskb.Exports["explorer.spa.DocPanel"];
const RouterExport = ref as tskb.Exports["explorer.spa.Router"];
const RegisterViewExport = ref as tskb.Exports["explorer.spa.Router.registerView"];
const InitExport = ref as tskb.Exports["explorer.spa.Router.init"];
const PushExport = ref as tskb.Exports["explorer.spa.Router.push"];
const RefreshExport = ref as tskb.Exports["explorer.spa.Router.refresh"];
const PanelRouterExport = ref as tskb.Exports["explorer.spa.panelRouter"];
const RefsViewExport = ref as tskb.Exports["explorer.spa.RefsView"];
const RenderAccordionExport = ref as tskb.Exports["explorer.spa.renderAccordion"];
const WireRefsExport = ref as tskb.Exports["explorer.spa.wireRefs"];
const NodeRefHooksExport = ref as tskb.Exports["explorer.spa.NodeRefHooks"];

const MountExport = ref as tskb.Exports["explorer.spa.ExplorerApp.mount"];
const ExplorerAppExport = ref as tskb.Exports["explorer.spa.ExplorerApp"];
const LoadInitialDataExport = ref as tskb.Exports["explorer.spa.ExplorerApp.loadInitialData"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the doc panel host and route addressable views?">
    <H1>Doc panel and router</H1>

    <H2>Panel host</H2>
    <P>
      {DocPanelExport} in {DocPanelModule} is the detail side panel. It is a thin shell — it
      subscribes to {PanelRouterExport} and, on each stack change, clears its header and body slots
      then delegates rendering entirely to the active <code>View</code>. It owns no view-specific
      markup, no deps, and no wiring logic.
    </P>

    <H2>Router and views</H2>
    <P>
      {RouterExport} maintains a stack of <code>View</code> instances. Callers construct a view with
      its own deps and call <code>push(view)</code>; the router appends it to the stack, notifies
      subscribers, and (when hash sync is on) writes the route to <code>location.hash</code>.{" "}
      {RegisterViewExport} serves a separate purpose: it binds a factory closure used only for hash
      restoration — when <code>hashchange</code> fires the router calls the factory to reconstruct a
      view from the URL fragment without needing a caller.
    </P>
    <P>Boot wiring (run once in mount):</P>
    <Snippet
      code={() => {
        const deps = {
          getNode: () => undefined,
          getRefsFor: () => [],
          onNodeRef: () => {},
          onNodeHighlight: () => {},
          onNodePrefetch: async () => {},
        };

        // Shell subscribes — every stack change re-renders the panel
        new DocPanel(panelRouter);

        // Bind deps into a factory closure for hash restoration only
        panelRouter.registerView(RefsView, deps);

        // Start hash sync; restores any view encoded in location.hash
        panelRouter.init({ syncHash: true });
      }}
    />
    <P>
      Each view is instantiated fresh per navigation with its own <code>nodeId</code>, kind, and{" "}
      {NodeRefHooksExport} — immutable after construction. Shared types (<code>View</code>,{" "}
      <code>ViewContext</code>) live in {RouterTypesModule}.
    </P>

    <H2>Reusable components</H2>
    <P>
      {RenderAccordionExport} in {AccordionModule} produces the <code>{"<details>"}</code> accordion
      markup shared across views. {WireRefsExport} in {RefLinksModule} attaches the
      hover/click/prefetch behavior to every <code>a.tskb-ref</code> under a root element. Views
      call {WireRefsExport} themselves at the end of each render — {DocPanelModule} has no knowledge
      of it. Hover shows a {DomTooltipModule} with the node's path, type color, and description; if
      the node's chunk isn't loaded yet, a background prefetch fires and the tooltip updates in
      place when data arrives.
    </P>

    <Relation from={DocPanelModule} to={RouterModule} label="subscribes to" />
    <Relation from={RouterModule} to={RouterTypesModule} label="implements types from" />
    <Relation from={RefsViewModule} to={AccordionModule} label="renders body via" />
    <Relation from={RefsViewModule} to={RefLinksModule} label="wires anchors via" />
    <Relation from={MainModule} to={DocPanelModule} label="opens on node select or chip click" />
    <Relation
      from={MainModule}
      to={RouterModule}
      label="registers view factories and starts hash sync"
    />

    <Flow
      name="router-setup"
      desc="Boot wiring: panel shell subscribes, view factory is registered for hash restore, hash sync starts"
      priority="essential"
    >
      <Step
        node={MountExport}
        label="ExplorerApp.mount() runs the panel-router setup block after canvas and renderer are ready"
      />
      <Step
        node={DocPanelExport}
        label="new DocPanel(router): shell subscribes so every stack change re-renders the panel"
      />
      <Step
        node={RegisterViewExport}
        label="registerView(RefsView, deps): binds deps into a factory closure keyed by RefsView.prefix"
      />
      <Step
        node={InitExport}
        label="init({ syncHash: true }): starts hashchange listening and restores any view in the current hash"
      />
      <Step
        node={RouterModule}
        label="If location.hash is non-empty, restoreFromHash() calls the factory to rebuild the view"
      />
      <Step
        node={DocPanelExport}
        label="onViewChange fires; header and body are rendered by the restored view"
      />
    </Flow>

    <Flow
      name="router-push"
      desc="Forward navigation: a chip click constructs a view, pushes it, the shell renders it, and the URL hash is updated"
      priority="essential"
    >
      <Step
        node={ExplorerAppExport}
        label="onChipClick(node, 'docs' | 'flows'): constructs new RefsView(nodeId, kind, deps)"
      />
      <Step
        node={PushExport}
        label="router.push(view): identical-route guard skips dupes; otherwise appends to the stack"
      />
      <Step
        node={RouterModule}
        label="notify() fans out the new top-of-stack and canGoBack to every subscriber"
      />
      <Step
        node={DocPanelExport}
        label="onViewChange clears title/body, calls view.renderHeader(title, ctx) then view.renderBody(body)"
      />
      <Step
        node={RefsViewExport}
        label="renderHeader and renderBody write HTML then call wireRefs on their own elements"
      />
      <Step
        node={RouterModule}
        label="writeHash() writes #/<route> to location.hash; the writingHash flag suppresses the echoed hashchange"
      />
    </Flow>

    <Flow
      name="router-hash-restore"
      desc="Browser back/forward or external hash change rebuilds the view from the URL"
      priority="essential"
    >
      <Step
        node={RouterModule}
        label="hashchange fires; if writingHash is set the event is our own echo and is ignored"
      />
      <Step
        node={RouterModule}
        label="restoreFromHash() strips the leading '#/'; an empty hash empties the stack and notifies"
      />
      <Step
        node={RouterModule}
        label="parseRoute(raw) splits the prefix, looks up the registered factory, and calls it with the rest"
      />
      <Step
        node={RefsViewExport}
        label="RefsView.parse(rest, deps) decodes the route and returns a fresh view instance (or null for malformed routes)"
      />
      <Step
        node={RouterModule}
        label="Existing stack is drained (each onLeave fired) and replaced with the single restored view"
      />
      <Step
        node={DocPanelExport}
        label="onViewChange paints the restored view; getNode may return undefined if the chunk hasn't loaded yet"
      />
    </Flow>

    <Flow
      name="router-refresh-after-load"
      desc="A hash-restored view that painted with placeholder labels repaints once the meta chunk arrives"
      priority="supplementary"
    >
      <Step
        node={LoadInitialDataExport}
        label="loadInitialData() awaits the meta chunk and writes it to the store"
      />
      <Step
        node={RefreshExport}
        label="router.refresh() re-notifies subscribers without changing the stack"
      />
      <Step
        node={RouterModule}
        label="notify() fans out the same top-of-stack view to every subscriber"
      />
      <Step
        node={DocPanelExport}
        label="onViewChange runs again; the view re-queries deps.getNode() and now resolves real labels"
      />
    </Flow>
  </Doc>
);
