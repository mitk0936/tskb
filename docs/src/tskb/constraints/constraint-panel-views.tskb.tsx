import { Doc, P, List, Li, ref } from "tskb";

const RouterModule = ref as tskb.Modules["explorer.spa.router"];
const RouterTypesModule = ref as tskb.Modules["explorer.spa.router-types"];
const AccordionModule = ref as tskb.Modules["explorer.spa.accordion"];
const RefLinksModule = ref as tskb.Modules["explorer.spa.ref-links"];
const DocPanelModule = ref as tskb.Modules["explorer.spa.doc-panel"];
const RouterViewsFolder = ref as tskb.Folders["tskb.explorer.app.router.views"];
const RouterComponentsFolder = ref as tskb.Folders["tskb.explorer.app.router.components"];
const RouterExport = ref as tskb.Exports["explorer.spa.Router"];
const PanelRouterExport = ref as tskb.Exports["explorer.spa.panelRouter"];
const RefsViewExport = ref as tskb.Exports["explorer.spa.RefsView"];
const NodeRefHooksExport = ref as tskb.Exports["explorer.spa.NodeRefHooks"];
const WireRefsExport = ref as tskb.Exports["explorer.spa.wireRefs"];
const RenderAccordionExport = ref as tskb.Exports["explorer.spa.renderAccordion"];

export default (
  <Doc explains="How are explorer panel views structured?" priority="constraint">
    <P>
      Every panel state in the explorer is a <code>View</code> class held in the {RouterModule}{" "}
      stack. {DocPanelModule} renders whichever view is on top — it has no view-specific markup of
      its own. New panel surfaces (docs list, settings page, flow inspector) must be added as Views,
      not as new methods on the panel or on {RouterExport}.
    </P>
    <P>A view class must:</P>
    <List>
      <Li>
        Live in {RouterViewsFolder} and implement the <code>View</code> interface from{" "}
        {RouterTypesModule}: a <code>route</code> getter, <code>renderHeader()</code>, and{" "}
        <code>renderBody()</code>.
      </Li>
      <Li>
        Expose a static <code>prefix</code> and a <code>parse(rest, deps)</code> factory, where{" "}
        <code>deps</code> is {NodeRefHooksExport}. {RouterExport} calls the factory to rebuild the
        view from <code>location.hash</code> when the user hits browser back or opens a bookmarked
        URL — without a caller to construct it. {RefsViewExport} is the reference implementation.
      </Li>
      <Li>
        Read from {NodeRefHooksExport} during <code>renderHeader()</code> and{" "}
        <code>renderBody()</code>, not in the constructor. A view restored from the URL may render
        before its data has loaded. Reading at render time means the view can repaint when{" "}
        {PanelRouterExport} <code>refresh()</code> fires and the data arrives.
      </Li>
      <Li>
        Call {WireRefsExport} on every element you render. {DocPanelModule} has no link wiring —
        views handle that themselves.
      </Li>
    </List>
    <P>
      Reusable UI belongs in {RouterComponentsFolder} — currently {AccordionModule} (
      {RenderAccordionExport}) and {RefLinksModule}. If two views duplicate markup or behavior,
      extract it there. A view is an addressable state; a component is shared rendering or wiring.
    </P>
    <P>
      <strong>Why this matters:</strong> the URL hash always reflects what the user is looking at.
      If a view reads data in the constructor, a hash-restored view silently shows stale or empty
      content. If new states bypass {RouterExport}, the hash stops updating and back-navigation
      breaks.
    </P>
  </Doc>
);
