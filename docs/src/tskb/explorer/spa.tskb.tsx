import { type File, Doc, H1, P, List, Li, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Files {
      "explorer.spa.html": File<{
        desc: "HTML entry point for the explorer SPA. Defines the toolbar, canvas, and side-panel skeleton.";
        path: "/packages/tskb/explorer-app/index.html";
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const HtmlFile = ref as tskb.Files["explorer.spa.html"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];
const ChunkTypesModule = ref as tskb.Modules["explorer.spa.chunk-types"];
const LaneEngineModule = ref as tskb.Modules["explorer.spa.lane-engine"];
const NodeBaseModule = ref as tskb.Modules["explorer.spa.node-base"];
const NodeTooltipModule = ref as tskb.Modules["explorer.spa.node-tooltip"];
const DocPanelModule = ref as tskb.Modules["explorer.spa.doc-panel"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="What are the SPA's main layers and how do they fit together?">
    <H1>Explorer SPA</H1>
    <P>
      The SPA is built with Vite (D3 in a separate vendor chunk) and lives in the{" "}
      <code>explorer-app/</code> directory. {HtmlFile} is the Vite entry point — it defines the
      toolbar, canvas, and side-panel DOM skeleton that {MainModule} attaches to at boot. The SPA is
      pre-built into <code>dist/explorer/</code> and shipped inside the tskb npm package.
    </P>
    <P>The SPA is split into five layers, each documented separately:</P>
    <List>
      <Li>
        <strong>Data layer</strong> ({ChunkTypesModule}) — loads and caches chunks of the graph on
        demand.
      </Li>
      <Li>
        <strong>Layout</strong> ({LaneEngineModule}) — arranges visible nodes into three horizontal
        lanes (structure, docs, terms/flows).
      </Li>
      <Li>
        <strong>Nodes, edges, and boundaries</strong> ({NodeBaseModule}) — draws the cards, parent–
        child edges, and architectural boundary outlines.
      </Li>
      <Li>
        <strong>Tooltips and spinners</strong> ({NodeTooltipModule}) — hover, code-preview, and
        per-node loading overlays that track their anchors as the canvas pans and zooms.
      </Li>
      <Li>
        <strong>Doc panel</strong> ({DocPanelModule}) — slide-in side panel that hosts a stack of
        addressable views, synced to <code>location.hash</code>.
      </Li>
    </List>
  </Doc>
);
