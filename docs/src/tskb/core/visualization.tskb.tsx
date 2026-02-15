import { type Folder, type Module, Doc, H1, P, ref } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "core.visualization": Folder<{
        desc: "Graphviz DOT visualization generator - transforms the knowledge graph into a hierarchical diagram";
        path: "packages/tskb/src/core/visualization";
      }>;
    }

    interface Modules {
      "visualization.dot-generator": Module<{
        desc: "DOT file generator - renders folders as nested subgraphs, modules as ellipses, terms as diamonds, docs as notes, with colored edges for relationship types";
        type: typeof import("packages/tskb/src/core/visualization/dot-generator.js");
      }>;
    }
  }
}

const VisFolder = ref as tskb.Folders["core.visualization"];
const DotGenModule = ref as tskb.Modules["visualization.dot-generator"];
const GenerateDotExport = ref as tskb.Exports["generateDot"];

export default (
  <Doc explains="Visualization module: DOT graph generation from the knowledge graph">
    <H1>Visualization</H1>
    <P>
      Located in {VisFolder}. Contains {DotGenModule} which provides {GenerateDotExport}. Transforms
      a KnowledgeGraph into Graphviz DOT format — folders become nested subgraphs, modules/exports
      are grouped within their folders, terms and docs get separate clusters. Output is written to
      .tskb/graph.dot during build.
    </P>
  </Doc>
);
