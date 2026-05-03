import { type Module, type Export, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.transform": Module<{
        desc: "Turns the graph into chunks the SPA can load.";
        type: typeof import("packages/tskb/src/core/explorer/transform.js");
      }>;
    }

    interface Exports {
      "explorer.transformGraph": Export<{
        desc: "Builds the explorer chunks from the graph.";
        type: typeof import("packages/tskb/src/core/explorer/transform.js").transformGraph;
      }>;

      "explorer.sanitizeFolderId": Export<{
        desc: "Turns a folder id into a safe chunk file name.";
        type: typeof import("packages/tskb/src/core/explorer/transform.js").sanitizeFolderId;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const TransformModule = ref as tskb.Modules["explorer.transform"];
const TransformGraphExport = ref as tskb.Exports["explorer.transformGraph"];
const GhostNodeTerm = ref as tskb.Terms["ghostNode"];
const ChunkTerm = ref as tskb.Terms["knowledgeChunk"];
const ExploreCommandModule = ref as tskb.Modules["cli.commands.explore"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the KnowledgeGraph become the chunks the explorer SPA loads?">
    <H1>Graph Transform</H1>
    <P>
      {TransformModule} is the single step between the raw knowledge graph and what the browser
      receives. {TransformGraphExport} is implemented as a class (
      <code>GraphToExplorerTransformer</code>) whose <code>transform()</code> method orchestrates
      all steps — edge indexing, meta assembly, folder chunk recursion, ghost injection, and child
      count patching.
    </P>

    <H2>Output shape</H2>
    <P>
      The output is <code>ExplorerChunks</code>: a <code>MetaChunk</code> plus a{" "}
      <code>Map&lt;folderId, FolderChunk&gt;</code>. The server and exporter serialize each entry to
      a separate {ChunkTerm} JSON file: <code>meta.json</code> and{" "}
      <code>folder-&#123;sanitizedId&#125;.json</code>.
    </P>
    <P>
      <strong>MetaChunk</strong> contains: root folder node, top-level folder summaries (with{" "}
      <code>_hasChildren</code> / <code>_childCount</code> hints), all doc nodes, flow nodes, term
      nodes, external nodes, and cross-lane <code>references</code> edges.
    </P>
    <P>
      <strong>FolderChunk</strong> contains: direct sub-folders, direct modules, all exports of
      those modules, import edges between modules in this folder (<code>internalEdges</code>), and
      import edges that cross the folder boundary (<code>externalEdges</code>).
    </P>

    <H2>Edge lookup indexes</H2>
    <P>
      Before anything else, the transformer builds two <code>Map&lt;nodeId, GraphEdge[]&gt;</code>{" "}
      indexes — one keyed by the source node id (<code>edgesBySource</code>) and one by the target
      node id (<code>edgesByTarget</code>). All subsequent queries run in O(1) per node instead of
      scanning the full edge list.
    </P>

    <H2>Recursive folder chunking</H2>
    <P>
      <code>buildAllFolderChunksRecursively()</code> does a depth-first walk starting from the root
      folder, following <code>contains</code> edges. For each folder it finds direct modules (via{" "}
      <code>belongs-to</code> edges pointing at the folder) and direct sub-folders (via{" "}
      <code>contains</code> edges from the folder). Folders with neither are skipped but still
      recursed into, so deeply nested folders with content are always reached.
    </P>

    <H2>Ghost node injection</H2>
    <P>
      Ghost injection runs in two passes. First, <code>buildGhostIntermediaryChains()</code> detects
      path gaps between a declared folder's path and its owned modules or sub-folders. When a module
      lives at <code>pkg/src/core/server.ts</code> but its declared parent folder has path{" "}
      <code>pkg</code>, the transformer synthesizes {GhostNodeTerm} <code>FolderChunk</code> entries
      for every intermediate directory (<code>pkg/src</code>, <code>pkg/src/core</code>) and
      re-parents the module to the deepest one. The chain is not synthesized if any intermediate
      path is already owned by a declared folder.
    </P>
    <P>
      Second, <code>injectGhostNodes()</code> scans every declared folder's{" "}
      <code>folder.children.files</code> and <code>folder.children.folders</code> (scanner data
      recorded during <code>tskb build</code>). Any <code>.ts</code> / <code>.tsx</code> file not
      already in a chunk becomes a ghost module node. Any direct child directory not already
      represented (either as a declared folder or a ghost intermediary) and not a transparent
      intermediary becomes a ghost folder node. Ghost intermediary chunks are not processed by this
      pass — they only contain what the graph already knows.
    </P>

    <H2>Child count patching</H2>
    <P>
      After ghost injection is complete, <code>patchFolderChildCounts()</code> writes the final{" "}
      <code>_hasChildren</code> and <code>_childCount</code> detail fields on every folder{" "}
      <code>ExplorerNode</code>. These fields drive the expand button visibility and badge in the
      SPA. The patch runs last so ghost nodes are included in the counts.
    </P>

    <Flow
      name="graph-to-chunks-transform"
      desc="How KnowledgeGraph becomes ExplorerChunks: edge indexing, meta assembly, recursive folder chunking, ghost node injection, child count patching"
    >
      <Step node={ExploreCommandModule} label="Reads graph.json from disk into KnowledgeGraph" />
      <Step
        node={TransformModule}
        label="groupEdgesByKey() builds edgesBySource + edgesByTarget indexes from all graph edges"
      />
      <Step
        node={TransformGraphExport}
        label="Assembles MetaChunk: root node, topFolders, docs, flows, terms, externals, cross-lane reference edges"
      />
      <Step
        node={TransformGraphExport}
        label="buildAllFolderChunksRecursively() depth-first: modules, exports, subfolders, internal + external import edges per folder"
      />
      <Step
        node={TransformModule}
        label="buildGhostIntermediaryChains() synthesizes FolderChunks for every intermediate filesystem directory between a declared folder path and its owned modules/subfolders"
      />
      <Step
        node={TransformModule}
        label="injectGhostNodes() adds placeholder ExplorerNodes for undeclared .ts/.tsx files and undeclared child directories recorded in folder.children scanner data"
      />
      <Step
        node={TransformModule}
        label="patchFolderChildCounts() finalizes _hasChildren + _childCount on all folder nodes after ghost injection"
      />
    </Flow>
  </Doc>
);
