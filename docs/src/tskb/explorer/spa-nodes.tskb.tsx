import { type Module, type Export, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.spa.node-base": Module<{
        desc: "Default node renderer for the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/base.js");
      }>;

      "explorer.spa.node-index": Module<{
        desc: "Picks the right node renderer for a given node type.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/index.js");
      }>;

      "explorer.spa.edge-renderer": Module<{
        desc: "Draws the edges between nodes on the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js");
      }>;

      "explorer.spa.boundary-renderer": Module<{
        desc: "Draws an outline around nodes that share a boundary.";
        type: typeof import("packages/tskb/explorer-app/src/components/BoundaryRenderer.js");
      }>;
    }

    interface Exports {
      "explorer.spa.BaseNodeRenderer": Export<{
        desc: "Default node component. Draws any node as a card.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/base.js").BaseNodeRenderer;
      }>;

      "explorer.spa.createNodeRenderer": Export<{
        desc: "Builds a node renderer wired with the SPA's interaction callbacks.";
        type: typeof import("packages/tskb/explorer-app/src/components/nodes/index.js").createNodeRenderer;
      }>;

      "explorer.spa.buildStructureLinks": Export<{
        desc: "Derives parent–child links from the visible nodes.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js").buildStructureLinks;
      }>;

      "explorer.spa.renderStructureEdges": Export<{
        desc: "Draws parent–child edges on the canvas.";
        type: typeof import("packages/tskb/explorer-app/src/components/edges/EdgeRenderer.js").renderStructureEdges;
      }>;

      "explorer.spa.renderBoundaryGroups": Export<{
        desc: "Draws an outline around the nodes that belong to each boundary.";
        type: typeof import("packages/tskb/explorer-app/src/components/BoundaryRenderer.js").renderBoundaryGroups;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const NodeBaseModule = ref as tskb.Modules["explorer.spa.node-base"];
const NodeIndexModule = ref as tskb.Modules["explorer.spa.node-index"];
const EdgeRendererModule = ref as tskb.Modules["explorer.spa.edge-renderer"];
const BoundaryRendererModule = ref as tskb.Modules["explorer.spa.boundary-renderer"];
const LaneEngineModule = ref as tskb.Modules["explorer.spa.lane-engine"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];

const BaseNodeRendererExport = ref as tskb.Exports["explorer.spa.BaseNodeRenderer"];
const CreateNodeRendererExport = ref as tskb.Exports["explorer.spa.createNodeRenderer"];
const BuildStructureLinksExport = ref as tskb.Exports["explorer.spa.buildStructureLinks"];
const RenderStructureEdgesExport = ref as tskb.Exports["explorer.spa.renderStructureEdges"];
const RenderBoundaryGroupsExport = ref as tskb.Exports["explorer.spa.renderBoundaryGroups"];

const NodeComponentTerm = ref as tskb.Terms["nodeComponent"];
const GhostNodeTerm = ref as tskb.Terms["ghostNode"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How are nodes, edges, and boundaries rendered on the canvas?">
    <H1>Nodes, edges, and boundaries</H1>

    <H2>Node components</H2>
    <P>
      {NodeIndexModule} is the extension point for node rendering: {CreateNodeRendererExport}{" "}
      accepts all interaction callbacks and returns a {NodeComponentTerm}. Currently always
      delegates to {BaseNodeRendererExport}; add a type-dispatch switch here when a node type needs
      its own renderer. {NodeBaseModule} defines the {NodeComponentTerm} interface and{" "}
      {BaseNodeRendererExport} — the default renderer for all node types. Each node is an SVG{" "}
      <code>&lt;g&gt;</code> containing a rounded-rect card, type icon, label, description,
      edge-count badge, a <code>&lt;&gt;</code> code preview bubble (top-center), and a{" "}
      <code>+</code> expand bubble (right edge). {GhostNodeTerm}s render as dashed transparent
      placeholders showing only their filename.
    </P>

    <H2>Edges</H2>
    <P>
      {EdgeRendererModule} derives parent→child links via {BuildStructureLinksExport} and draws them
      as horizontal cubic-bezier SVG paths via {RenderStructureEdgesExport}. Ghost links (where
      either endpoint has <code>detail._ghost = 'true'</code>) render with a dashed stroke and
      reduced opacity. It also renders the labeled background bands for each lane.
    </P>

    <H2>Boundaries</H2>
    <P>
      {BoundaryRendererModule} draws architectural boundary outlines. When a folder node carries{" "}
      <code>detail.boundary</code>, all visible descendants (resolved by walking{" "}
      <code>parentOf</code>) are grouped under that boundary name. {RenderBoundaryGroupsExport}{" "}
      computes a convex hull over the bounding boxes of all member nodes, perturbs the hull points
      with a seeded pseudo-random wobble (stable across re-renders), and smooths the result with{" "}
      <code>d3.curveBasisClosed</code> for a hand-drawn look. The outline renders as a violet dashed
      stroke with a near-transparent fill and a pill label at the top. All elements have{" "}
      <code>pointer-events: none</code>.
    </P>

    <Relation from={NodeBaseModule} to={LaneEngineModule} label="reads NODE_SIZES from" />
    <Relation from={EdgeRendererModule} to={LaneEngineModule} label="reads LaneLayout from" />
    <Relation from={MainModule} to={NodeBaseModule} label="calls enter/update on node selections" />
    <Relation from={MainModule} to={EdgeRendererModule} label="calls renderStructureEdges" />
    <Relation from={MainModule} to={BoundaryRendererModule} label="calls renderBoundaryGroups" />
  </Doc>
);
