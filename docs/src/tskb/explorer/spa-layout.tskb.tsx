import { type Module, type Export, Doc, H1, P, List, Li, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.spa.lane-engine": Module<{
        desc: "Lays out visible nodes on the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/layout/lane-engine.js");
      }>;
    }

    interface Exports {
      "explorer.spa.computeLayout": Export<{
        desc: "Computes positions for all visible nodes.";
        type: typeof import("packages/tskb/explorer-app/src/layout/lane-engine.js").computeLayout;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const LaneEngineModule = ref as tskb.Modules["explorer.spa.lane-engine"];
const ComputeLayoutExport = ref as tskb.Exports["explorer.spa.computeLayout"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];
const LaneTerm = ref as tskb.Terms["explorerLane"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the lane engine arrange nodes into three lanes on the canvas?">
    <H1>Three-lane layout</H1>
    <P>
      {LaneEngineModule} computes all SVG positions in a single pass. The canvas has three{" "}
      {LaneTerm}s stacked vertically:
    </P>
    <List>
      <Li>
        <strong>Structure</strong> — builds a <code>d3.hierarchy</code> from the visible tree (root
        → expanded folders → modules → exports, including sub-folder nesting). Runs{" "}
        <code>d3.tree().nodeSize()</code> for left-to-right positioning. Collapsed folders with{" "}
        <code>_childCount &gt; 0</code> inject ghost placeholder nodes so the tree pre-reserves
        space for their children.
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
      On every expand or collapse, {MainModule} calls {ComputeLayoutExport} and fully re-renders the
      D3 selection with enter/update/exit.
    </P>

    <Relation from={MainModule} to={LaneEngineModule} label="calls computeLayout on each render" />
  </Doc>
);
