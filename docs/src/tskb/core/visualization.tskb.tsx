import { type Folder, type Module, type Term, Doc, H1, P, ref, Relation } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      "core.visualization": Folder<{
        desc: "Turns the graph into a Graphviz DOT diagram.";
        path: "packages/tskb/src/core/visualization";
      }>;
    }

    interface Modules {
      "visualization.dot-generator": Module<{
        desc: "DOT generator for the graph.";
        type: typeof import("packages/tskb/src/core/visualization/dot-generator.js");
      }>;
    }

    interface Terms {
      dotFile: Term<"A Graphviz DOT file. Plain text describing nodes and edges. Used to draw the graph as a diagram with `dot -Tpng`.">;
    }
  }
}

const VisFolder = ref as tskb.Folders["core.visualization"];
const DotGenModule = ref as tskb.Modules["visualization.dot-generator"];
const GenerateDotExport = ref as tskb.Exports["generateDot"];
const GraphBuilder = ref as tskb.Modules["graph.builder"];

export default (
  <Doc explains="How is the knowledge graph rendered into a Graphviz DOT file?">
    <H1>Visualization</H1>
    <P>
      Located in {VisFolder}. Contains {DotGenModule} which provides {GenerateDotExport}. Transforms
      a KnowledgeGraph into Graphviz DOT format — folders become nested subgraphs, modules/exports
      are grouped within their folders, terms and docs get separate clusters. Output is written to
      .tskb/graph.dot during build.
    </P>
    <Relation from={DotGenModule} to={GenerateDotExport} />
    <Relation from={DotGenModule} to={GraphBuilder} />
  </Doc>
);
