import { type Folder, type Module, type Export, Doc, H1, H2, P, List, Li, ref } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "core.extraction.graph": Folder<{
        desc: "Part of the core of the library responsible for building the graph structure, mapping nodes and relations between them into nodes - edges";
        path: "packages/tskb/src/core/graph";
      }>;
    }

    interface Modules {
      "graph.builder": Module<{
        desc: "Module containing utility functions for constructing the graph";
        type: typeof import("packages/tskb/src/core/graph/builder.js");
      }>;

      "graph.types": Module<{
        desc: "Type definitions for the knowledge graph data model - all node types, edge types, and the KnowledgeGraph structure";
        type: typeof import("packages/tskb/src/core/graph/types.js");
      }>;
    }

    interface Exports {
      buildGraph: Export<{
        desc: "Main entry point for graph construction - takes extracted registry and docs, produces a complete KnowledgeGraph";
        type: typeof import("packages/tskb/src/core/graph/builder.js").buildGraph;
      }>;
      KnowledgeGraph: Export<{
        desc: "The top-level graph structure containing all nodes (folders, modules, terms, exports, docs), edges, and metadata";
        type: import("packages/tskb/src/core/graph/types.js").KnowledgeGraph;
      }>;
    }
  }
}

const GraphFolder = ref as tskb.Folders["core.extraction.graph"];
const BuilderModule = ref as tskb.Modules["graph.builder"];
const TypesModule = ref as tskb.Modules["graph.types"];
const BuildGraphExport = ref as tskb.Exports["buildGraph"];
const KnowledgeGraphExport = ref as tskb.Exports["KnowledgeGraph"];

export default (
  <Doc explains="Graph module: data model (types) and construction (builder) of the knowledge graph">
    <H1>Graph Module</H1>
    <P>
      Located in {GraphFolder}. Takes extracted registry and documentation, produces a{" "}
      {KnowledgeGraphExport}.
    </P>

    <H2>Modules</H2>
    <List>
      <Li>
        {TypesModule}: Defines the graph data model. Node types: FolderNode, ModuleNode, TermNode,
        ExportNode, DocNode. Edge types: references, belongs-to, contains, related-to. Top-level
        structure: {KnowledgeGraphExport} with nodes, edges, and metadata.
      </Li>
      <Li>
        {BuilderModule}: {BuildGraphExport} creates nodes from registry items and docs, then builds
        edges — explicit references from docs and inferred hierarchy from folder paths
        (contains/belongs-to).
      </Li>
    </List>
  </Doc>
);
