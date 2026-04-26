import { type Folder, type External, type Term, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    // ── Folders ────────────────────────────────────────────────────────────

    interface Folders {
      "tskb.explorer.core": Folder<{
        desc: "CLI-side explorer layer: graph→chunk transform, HTTP server, and static export";
        path: "packages/tskb/src/core/explorer";
        boundary: "TSKB Explorer server";
      }>;

      "tskb.explorer.app": Folder<{
        desc: "Vite SPA source for the interactive explorer UI. Built separately from the library (npm run build:explorer) and shipped in dist/explorer/";
        path: "packages/tskb/explorer-app";
        boundary: "TSKB Explorer SPA";
      }>;

      "tskb.explorer.app.components": Folder<{
        desc: "Node and edge rendering components for the D3 canvas. Each node type implements NodeComponent; edges are drawn by EdgeRenderer";
        path: "packages/tskb/explorer-app/src/components";
      }>;

      "tskb.explorer.app.graph": Folder<{
        desc: "SPA data layer: chunk type registry, type-safe loader with LRU cache";
        path: "packages/tskb/explorer-app/src/graph";
      }>;

      "tskb.explorer.app.layout": Folder<{
        desc: "Lane layout engine: computes SVG positions for structure (d3.tree), docs, and other lanes";
        path: "packages/tskb/explorer-app/src/layout";
      }>;

      "tskb.explorer.app.store": Folder<{
        desc: "Pure graph data store (loaded chunks only). UI state lives outside the store in main.ts";
        path: "packages/tskb/explorer-app/src/store";
      }>;

      "tskb.explorer.app.ui": Folder<{
        desc: "UI shell components: global spinner, per-node spinner, node hover tooltip, and code preview popup";
        path: "packages/tskb/explorer-app/src/ui";
      }>;
    }

    // ── Externals ──────────────────────────────────────────────────────────

    interface Externals {
      d3: External<{
        desc: "D3 data-visualisation library. Used for tree layout (d3.hierarchy, d3.tree), zoom/pan (d3.zoom), SVG path curves (curveBasisClosed), and polygon hull computation (d3.polygonHull).";
        url: "https://d3js.org";
        kind: "npm-package";
      }>;
      vite: External<{
        desc: "Frontend build tool that bundles the explorer SPA. Configured in packages/tskb/explorer-app/vite.config.ts; outputs to dist/explorer/.";
        url: "https://vitejs.dev";
        kind: "npm-package";
      }>;
    }

    // ── Terms ──────────────────────────────────────────────────────────────

    interface Terms {
      knowledgeChunk: Term<"An on-demand JSON fragment of the knowledge graph. meta.json contains root folder, top-level folder summaries, docs, flows, and terms. folder-{id}.json contains modules, exports, sub-folders, and import edges for one folder.">;
      explorerLane: Term<"A horizontal section of the explorer SVG canvas. Three lanes stack vertically: Structure (code hierarchy, d3.tree), Each lane has a labeled background band.">;
      nodeComponent: Term<"Interface for rendering a node type in the D3 canvas: enter() appends SVG elements, update() repositions them, anchor() returns edge connection points, getSize() returns bounding box. Implemented by BaseNodeRenderer; override per type.">;
      lruChunkCache: Term<"Bounded LRU cache inside ChunkLoader (max 50 entries). Map insertion order is used for O(1) LRU: on get, entry is deleted and re-inserted; on set overflow, oldest key is evicted. Chunks are immutable so no invalidation is needed.">;
      explorerStaticExport: Term<"Self-contained static export produced by `tskb explore --export`. Contains the pre-built SPA (index.html + hashed JS chunks) and all graph chunk JSON files. Works offline via file:// because the SPA uses relative fetch paths.">;
      ghostNode: Term<"A placeholder ExplorerNode with detail._ghost = 'true'. Ghost nodes represent filesystem directories or files visible in the tree that are not declared in the knowledge graph. Two sources: (1) buildGhostIntermediaryChains() in transform.ts synthesizes ghost FolderChunks for every intermediate filesystem directory between a declared folder's path and its owned modules; (2) injectGhostNodes() in transform.ts adds ghost module/folder nodes from folder.children scanner data. Lane-engine also injects transient ghost placeholders for collapsed folders with _childCount > 0 to pre-reserve tree space. All ghost nodes render as dashed transparent cards with only a filename label.">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const D3External = ref as tskb.Externals["d3"];
const ViteExternal = ref as tskb.Externals["vite"];
const LayoutFolder = ref as tskb.Folders["tskb.explorer.app.layout"];
const ComponentsFolder = ref as tskb.Folders["tskb.explorer.app.components"];
const ExplorerCoreFolder = ref as tskb.Folders["tskb.explorer.core"];
const ExplorerAppFolder = ref as tskb.Folders["tskb.explorer.app"];
const TransformModule = ref as tskb.Modules["explorer.transform"];
const ServerModule = ref as tskb.Modules["explorer.server"];
const ExportModule = ref as tskb.Modules["explorer.export"];
const TransformGraphExport = ref as tskb.Exports["explorer.transformGraph"];
const ServeExplorerExport = ref as tskb.Exports["explorer.serveExplorer"];
const ExportExplorerExport = ref as tskb.Exports["explorer.exportExplorer"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="tskb Explorer: interactive visual graph browser opened via `tskb explore`. Architecture, data flow, SPA layout, and extension points."
    priority="essential"
  >
    <H1>Explorer</H1>
    <P>
      The explorer is a D3-powered SPA that renders the knowledge graph as a visual, interactive
      diagram. It opens via <code>tskb explore</code> (local HTTP server) or exports to a
      self-contained static folder via <code>tskb explore --export</code>.
    </P>
    <P>
      The implementation splits into two layers: the CLI-side layer in {ExplorerCoreFolder} (graph
      transform, HTTP server, static export) and the Vite SPA in {ExplorerAppFolder} (D3 canvas,
      chunk loading, layout, node components).
    </P>

    <H2>CLI layer</H2>
    <P>The CLI layer has three focused modules — see their dedicated docs for details:</P>
    <P>
      {TransformModule} ({TransformGraphExport}) — converts a flat <code>KnowledgeGraph</code> into{" "}
      <code>ExplorerChunks</code>: a <code>MetaChunk</code> plus one <code>FolderChunk</code> per
      folder that has modules or sub-folders. Ghost nodes are injected for filesystem files not
      declared in the graph.
    </P>
    <P>
      {ServerModule} ({ServeExplorerExport}) — Node built-in <code>http</code> server that caches
      all chunk JSON strings in memory after the first transform and serves them at{" "}
      <code>/chunks/*.json</code>. No external server dependency.
    </P>
    <P>
      {ExportModule} ({ExportExplorerExport}) — copies the pre-built SPA assets to an output
      directory and writes all chunk JSON files alongside them, producing a fully self-contained
      static explorer.
    </P>

    <Relation
      from={LayoutFolder}
      to={D3External}
      label="d3.hierarchy + d3.tree for left-to-right layout"
    />
    <Relation
      from={ComponentsFolder}
      to={D3External}
      label="D3 enter/update/exit, d3.polygonHull, curveBasisClosed"
    />
    <Relation
      from={ExplorerAppFolder}
      to={ViteExternal}
      label="bundled by Vite into dist/explorer/"
    />

    <H2>Build integration</H2>
    <P>
      <code>npm run build:explorer</code> runs Vite, outputting to <code>dist/explorer/</code>.{" "}
      <code>npm run build:lib</code> runs <code>tsc</code>, outputting to <code>dist/</code>. The
      full <code>npm run build</code> runs explorer first, then lib — so the SPA assets are inside{" "}
      <code>dist/</code> when the package is published.
    </P>
    <P>
      During development, <code>npm run dev:explorer</code> starts Vite's HMR dev server against a
      fixed <code>chunks/</code> directory. The CLI <code>build:lib</code> must be run at least once
      so the <code>dist/</code> server code exists.
    </P>
  </Doc>
);
