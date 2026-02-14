import { Module } from "node_modules/tskb/src";
import { Folder } from "packages/tskb/dist";

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
        type: typeof import("packages/tskb/src/core/graph/builder");
      }>;
    }
  }
}
