import { type Module, type Export, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
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

      "explorer.spa.dom-tooltip": Module<{
        desc: "Tooltip anchored to a DOM element, used by the doc panel.";
        type: typeof import("packages/tskb/explorer-app/src/ui/DomTooltip.js");
      }>;
    }

    interface Exports {
      "explorer.spa.showNodeSpinner": Export<{
        desc: "Shows a small spinner next to a node.";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js").showNodeSpinner;
      }>;

      "explorer.spa.removeNodeSpinner": Export<{
        desc: "Removes a spinner shown by `showNodeSpinner`.";
        type: typeof import("packages/tskb/explorer-app/src/ui/Spinner.js").removeNodeSpinner;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const SpinnerModule = ref as tskb.Modules["explorer.spa.spinner"];
const NodeTooltipModule = ref as tskb.Modules["explorer.spa.node-tooltip"];
const CodeTooltipModule = ref as tskb.Modules["explorer.spa.code-tooltip"];
const DomTooltipModule = ref as tskb.Modules["explorer.spa.dom-tooltip"];
const NodeBaseModule = ref as tskb.Modules["explorer.spa.node-base"];
const DocPanelModule = ref as tskb.Modules["explorer.spa.doc-panel"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];

const ShowNodeSpinnerExport = ref as tskb.Exports["explorer.spa.showNodeSpinner"];
const RemoveNodeSpinnerExport = ref as tskb.Exports["explorer.spa.removeNodeSpinner"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How do tooltips and spinners track canvas nodes as they pan and zoom?">
    <H1>Tooltips and spinners</H1>

    <H2>Spinners</H2>
    <P>
      {SpinnerModule} provides a full-screen global spinner (shown while <code>meta.json</code>{" "}
      loads) and a per-node inline spinner: {ShowNodeSpinnerExport} appends an animated SVG ring at
      the node's canvas position; {RemoveNodeSpinnerExport} removes it in the <code>finally</code>{" "}
      block after the chunk fetch settles.
    </P>

    <H2>Hover and code tooltips</H2>
    <P>
      {NodeTooltipModule} appears on hover, anchored to the node's right-center SVG position.{" "}
      {CodeTooltipModule} is a click-toggled code preview popup anchored to the node's top-center
      SVG position. Both receive <code>updateXxxTransform()</code> calls from {MainModule} on every
      D3 zoom event so they reposition to track their anchor nodes as the canvas pans and zooms.
    </P>

    <H2>DOM tooltip</H2>
    <P>
      {DomTooltipModule} is anchored to a DOM element rather than an SVG node. It is used by{" "}
      {DocPanelModule} to show a small popup on <code>a.tskb-ref</code> hover with the referenced
      node's path, type color, and description.
    </P>

    <Relation from={MainModule} to={NodeTooltipModule} label="propagates zoom transform to" />
    <Relation from={MainModule} to={CodeTooltipModule} label="propagates zoom transform to" />
    <Relation from={NodeBaseModule} to={NodeTooltipModule} label="triggers show/hide on hover" />
    <Relation from={NodeBaseModule} to={CodeTooltipModule} label="triggers toggle on <> click" />
    <Relation from={DocPanelModule} to={DomTooltipModule} label="shows on ref link hover" />
  </Doc>
);
