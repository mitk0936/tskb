import { Doc, P, List, Li, ref } from "tskb";

const RouterModule = ref as tskb.Modules["explorer.spa.router"];
const RouterTypesModule = ref as tskb.Modules["explorer.spa.router-types"];
const AccordionModule = ref as tskb.Modules["explorer.spa.accordion"];
const RefLinksModule = ref as tskb.Modules["explorer.spa.ref-links"];
const DocPanelModule = ref as tskb.Modules["explorer.spa.doc-panel"];
const RouterExport = ref as tskb.Exports["explorer.spa.Router"];
const PanelRouterExport = ref as tskb.Exports["explorer.spa.panelRouter"];
const RefsViewExport = ref as tskb.Exports["explorer.spa.RefsView"];
const WireRefsExport = ref as tskb.Exports["explorer.spa.wireRefs"];
const RenderAccordionExport = ref as tskb.Exports["explorer.spa.renderAccordion"];

export default (
  <Doc explains="How are explorer panel views structured?" priority="constraint">
    <P>
      Every panel state in the explorer SPA is a <code>View</code> class living under {RouterModule}
      . {RouterExport} owns a stack of views and renders the top into {DocPanelModule}; the panel
      itself is a thin host shell with no view-specific markup. New panel surfaces — an "all docs"
      list, a settings page, a flow inspector — must follow the same contract instead of growing new{" "}
      <code>show*()</code> methods on the panel or the router.
    </P>
    <P>A view class must:</P>
    <List>
      <Li>
        Live in <code>explorer-app/src/router/views/</code> and implement the <code>View</code>{" "}
        interface declared in {RouterTypesModule} (<code>route()</code>, <code>renderHeader()</code>
        , <code>renderBody()</code>).
      </Li>
      <Li>
        Expose a static <code>prefix</code> and <code>parse(rest, deps)</code> factory so{" "}
        {RouterExport} can rebuild it from <code>location.hash</code> on browser back/forward or a
        deep link. {RefsViewExport} is the reference implementation.
      </Li>
      <Li>
        Look up graph data through the injected <code>RouterDeps</code> (<code>getNode</code>,{" "}
        <code>getRefsFor</code>, ...) <strong>at render time</strong>, never snapshot it in the
        constructor. A hash-restored view may paint before the relevant chunk has loaded; rendering
        against live deps lets it refresh in place when {PanelRouterExport} <code>refresh()</code>{" "}
        fires after meta arrives.
      </Li>
      <Li>
        Output pure HTML for <code>a.tskb-ref</code> anchors and let {DocPanelModule} call{" "}
        {WireRefsExport} once after the render. Views must not bind their own click or hover
        listeners — that wiring is centralized so a single delegated handler covers header and body.
      </Li>
    </List>
    <P>
      Reusable UI chunks belong in <code>explorer-app/src/router/components/</code> — currently{" "}
      {AccordionModule} ({RenderAccordionExport}) and {RefLinksModule}. If two views start
      duplicating markup or behavior, extract a component there rather than copying. The components
      folder is for genuine reuse, not for any chunk of panel UI: a view is a distinct
      URL-addressable state, a component is shared rendering or wiring.
    </P>
    <P>
      <strong>Why this matters:</strong> the panel is the explorer's deep-link surface. If a view
      snapshots data, hash restoration silently shows stale or empty content. If a view binds its
      own listeners, the host can't safely re-render between view transitions. If new states are
      added as ad-hoc methods on {DocPanelModule}, they bypass hash sync entirely and the URL stops
      describing what the user is looking at.
    </P>
  </Doc>
);
