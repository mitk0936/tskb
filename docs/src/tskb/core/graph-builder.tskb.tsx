import {
  type Folder,
  type Module,
  type Export,
  Doc,
  H1,
  H2,
  P,
  List,
  Li,
  ref,
  Relation,
} from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "core.extraction.graph": Folder<{
        desc: "Builds the knowledge graph from extracted registry and docs.";
        path: "packages/tskb/src/core/graph";
      }>;
    }

    interface Modules {
      "graph.builder": Module<{
        desc: "Assembles the graph from extracted data.";
        type: typeof import("packages/tskb/src/core/graph/builder.js");
      }>;

      "graph.types": Module<{
        desc: "Type definitions for the knowledge graph.";
        type: typeof import("packages/tskb/src/core/graph/types.js");
      }>;

      "graph.writer": Module<{
        desc: "Writes the graph to disk as per-type JSON files under `.tskb/graph/`.";
        type: typeof import("packages/tskb/src/core/graph/writer.js");
      }>;
    }

    interface Exports {
      buildGraph: Export<{
        desc: "Builds the knowledge graph from extracted registry and docs.";
        type: typeof import("packages/tskb/src/core/graph/builder.js").buildGraph;
      }>;
      KnowledgeGraph: Export<{
        desc: "The full graph: nodes, edges, and metadata.";
        type: import("packages/tskb/src/core/graph/types.js").KnowledgeGraph;
      }>;
      FlowNode: Export<{
        desc: "Graph node for a Flow.";
        type: import("packages/tskb/src/core/graph/types.js").FlowNode;
      }>;
      FlowStep: Export<{
        desc: "One step inside a Flow.";
        type: import("packages/tskb/src/core/graph/types.js").FlowStep;
      }>;

      writeSplitGraph: Export<{
        desc: "Writes the graph to `.tskb/graph/` as separate JSON files, one per node type.";
        type: typeof import("packages/tskb/src/core/graph/writer.js").writeSplitGraph;
      }>;
    }
  }
}

const GraphFolder = ref as tskb.Folders["core.extraction.graph"];
const BuilderModule = ref as tskb.Modules["graph.builder"];
const TypesModule = ref as tskb.Modules["graph.types"];
const WriterModule = ref as tskb.Modules["graph.writer"];
const BuildGraphExport = ref as tskb.Exports["buildGraph"];
const WriteSplitGraphExport = ref as tskb.Exports["writeSplitGraph"];
const KnowledgeGraphExport = ref as tskb.Exports["KnowledgeGraph"];
const FlowNodeExport = ref as tskb.Exports["FlowNode"];

export default (
  <Doc explains="How is the knowledge graph modeled and assembled from extracted data?">
    <H1>Graph Module</H1>
    <P>
      Located in {GraphFolder}. Takes extracted registry and documentation, produces a{" "}
      {KnowledgeGraphExport}.
    </P>

    <H2>Modules</H2>
    <List>
      <Li>
        {TypesModule}: Defines the graph data model. Node types: FolderNode, ModuleNode, TermNode,
        ExportNode, {FlowNodeExport}, DocNode. Edge types: references, belongs-to, contains,
        related-to, flow-step. Top-level structure: {KnowledgeGraphExport} with nodes, edges, and
        metadata.
      </Li>
      <Li>
        {BuilderModule}: {BuildGraphExport} creates nodes from registry items and docs, then builds
        edges — explicit references from docs and inferred hierarchy from folder paths
        (contains/belongs-to).
      </Li>
      <Li>
        {WriterModule}: {WriteSplitGraphExport} takes the assembled graph and writes one JSON file
        per node type into <code>.tskb/graph/</code>, plus a lightweight search index.
      </Li>
    </List>
    <Relation from={BuildGraphExport} to={KnowledgeGraphExport} />
  </Doc>
);
