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
        desc: "Wires hover, click and prefetch behavior on a.tskb-ref anchors inside panel views, and rewrites their text to short node labels.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/RefLinks.js");
      }>;

      "explorer.spa.relations": Module<{
        desc: "Turns the hidden Relation carrier spans in doc HTML into visible from/to chip blocks with a caption; hovering one highlights its arc on the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/Relations.js");
      }>;

      "explorer.spa.node-label": Module<{
        desc: "Short display label for a node reference in the panel: file name for modules and files, name/ for folders.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/NodeLabel.js");
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
        desc: "Attaches hover, click and prefetch handlers to every a.tskb-ref under a root element, and relabels each anchor with its node's short display label.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/RefLinks.js").wireRefs;
      }>;

      "explorer.spa.enhanceRelations": Export<{
        desc: "Rebuilds every span.tskb-relation under a root element into two node chips joined by a bracket and caption. Call before wireRefs so the chips get wired and labelled.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/Relations.js").enhanceRelations;
      }>;

      "explorer.spa.shortNodeLabel": Export<{
        desc: "Maps a node kind and its display path to the short label the panel shows: `Router.ts`, `router/index.ts`, `views/`; other kinds pass through.";
        type: typeof import("packages/tskb/explorer-app/src/router/components/NodeLabel.js").shortNodeLabel;
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
const NodeLabelModule = ref as tskb.Modules["explorer.spa.node-label"];
const RelationsModule = ref as tskb.Modules["explorer.spa.relations"];
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
const ShortNodeLabelExport = ref as tskb.Exports["explorer.spa.shortNodeLabel"];
const EnhanceRelationsExport = ref as tskb.Exports["explorer.spa.enhanceRelations"];
const ExportDisplayLabelExport = ref as tskb.Exports["explorer.spa.exportDisplayLabel"];
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
    <H2>Relations</H2>
    <P>
      A doc's <code>{"<Relation>"}</code> elements reach the browser as empty{" "}
      <code>span.tskb-relation</code> carriers (<code>data-from</code>, <code>data-to</code>,{" "}
      <code>data-label</code>, plus a pre-computed type and display path per end).{" "}
      {EnhanceRelationsExport} in {RelationsModule} rebuilds each carrier into a visible block: the
      from and to nodes stacked as <code>a.tskb-ref</code> chips, joined by a bracket to the
      relation's caption. Views call it before {WireRefsExport}, so the chips get the same click,
      hover and labelling as any other ref. Hovering a block highlights the matching relation arc on
      the canvas through the <code>onRelationHighlight</code> hook of {NodeRefHooksExport}.
    </P>

    <H2>Reference labels</H2>
    <P>
      {WireRefsExport} also rewrites each anchor's text to a short, meaningful label — never the
      registry key. Exports go through {ExportDisplayLabelExport} (<code>Router {"{...}"}</code>,{" "}
      <code>mount(...)</code>); modules, files and folders go through {ShortNodeLabelExport} in{" "}
      {NodeLabelModule}, which keeps the last path segment (<code>Router.ts</code>,{" "}
      <code>views/</code>) and the parent for <code>index.*</code> files. The full path stays on the
      anchor's <code>title</code> and in the hover tooltip. Anchors whose node isn't loaded fall
      back to the <code>data-node-type</code> / <code>data-node-display</code> attributes the build
      pre-computed (a path for module, file and folder refs, and — for flow steps — the same fields
      inside the flow's <code>stepsJson</code>). Export labels exist only on the node, so export
      anchors without a loaded node are prefetched and relabelled in place once their chunk lands;
      the panel body is not re-rendered, so open accordions survive.
    </P>

    <Relation from={DocPanelModule} to={RouterModule} label="subscribes to" />
    <Relation from={RouterModule} to={RouterTypesModule} label="implements types from" />
    <Relation from={RefsViewModule} to={AccordionModule} label="renders body via" />
    <Relation from={RefsViewModule} to={RefLinksModule} label="wires anchors via" />
    <Relation from={RefsViewModule} to={RelationsModule} label="renders Relation blocks via" />
    <Relation
      from={RefLinksModule}
      to={NodeLabelModule}
      label="shortens module/file/folder labels with"
    />
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
        label="sets up the panel router after canvas and renderer are ready"
      />
      <Step
        node={DocPanelExport}
        label="the panel shell subscribes so every stack change re-renders it"
      />
      <Step node={RegisterViewExport} label="registers the view factory for hash restore" />
      <Step node={InitExport} label="starts hash sync and restores any view in the current hash" />
      <Step node={RouterModule} label="rebuilds the view from the current hash, if any" />
      <Step node={DocPanelExport} label="renders the restored view's header and body" />
    </Flow>

    <Flow
      name="router-push"
      desc="Forward navigation: a chip click constructs a view, pushes it, the shell renders it, and the URL hash is updated"
      priority="essential"
    >
      <Step node={ExplorerAppExport} label="a chip click constructs a refs view" />
      <Step node={PushExport} label="pushes the view onto the stack, skipping duplicate routes" />
      <Step node={RouterModule} label="notifies subscribers of the new top-of-stack" />
      <Step node={DocPanelExport} label="renders the pushed view's header and body" />
      <Step node={RefsViewExport} label="writes its HTML and wires its ref links" />
      <Step
        node={RouterModule}
        label="writes the route to the URL hash, suppressing its own echo"
      />
    </Flow>

    <Flow
      name="router-hash-restore"
      desc="Browser back/forward or external hash change rebuilds the view from the URL"
      priority="essential"
    >
      <Step node={RouterModule} label="a hash change fires, ignoring the router's own echo" />
      <Step node={RouterModule} label="restores from the hash; an empty hash clears the stack" />
      <Step node={RouterModule} label="parses the route and looks up the registered factory" />
      <Step
        node={RefsViewExport}
        label="decodes the route into a fresh view, or null if malformed"
      />
      <Step
        node={RouterModule}
        label="drains the existing stack and replaces it with the restored view"
      />
      <Step
        node={DocPanelExport}
        label="paints the restored view, even if its chunk hasn't loaded yet"
      />
    </Flow>

    <Flow
      name="router-refresh-after-load"
      desc="A hash-restored view that painted with placeholder labels repaints once the meta chunk arrives"
      priority="supplementary"
    >
      <Step
        node={LoadInitialDataExport}
        label="the meta chunk arrives and is written to the store"
      />
      <Step node={RefreshExport} label="re-notifies subscribers without changing the stack" />
      <Step node={RouterModule} label="fans the same top-of-stack view out to subscribers" />
      <Step node={DocPanelExport} label="repaints the view, now resolving real labels" />
    </Flow>
  </Doc>
);
