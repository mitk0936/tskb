import { type Folder, type External, type Term, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    // ── Folders ────────────────────────────────────────────────────────────

    interface Folders {
      "tskb.explorer.core": Folder<{
        desc: "Server side of the explorer: turns the graph into chunks and serves them.";
        path: "packages/tskb/src/core/explorer";
        boundary: "TSKB Explorer server";
      }>;

      "tskb.explorer.app": Folder<{
        desc: "The browser app shown by the explorer.";
        path: "packages/tskb/explorer-app";
        boundary: "TSKB Explorer SPA";
      }>;

      "tskb.explorer.app.components": Folder<{
        desc: "Node and edge components drawn on the canvas.";
        path: "packages/tskb/explorer-app/src/components";
      }>;

      "tskb.explorer.app.graph": Folder<{
        desc: "Data layer for the SPA. Loads and caches chunks.";
        path: "packages/tskb/explorer-app/src/graph";
      }>;

      "tskb.explorer.app.layout": Folder<{
        desc: "Layout engine that positions nodes on the canvas.";
        path: "packages/tskb/explorer-app/src/layout";
      }>;

      "tskb.explorer.app.store": Folder<{
        desc: "Holds the loaded graph data for the SPA.";
        path: "packages/tskb/explorer-app/src/store";
      }>;

      "tskb.explorer.app.ui": Folder<{
        desc: "UI bits around the canvas: spinners, tooltips, popups.";
        path: "packages/tskb/explorer-app/src/ui";
      }>;

      "tskb.explorer.app.router.views": Folder<{
        desc: "Panel view classes — one per addressable panel state. Each implements the View interface.";
        path: "packages/tskb/explorer-app/src/router/views";
      }>;

      "tskb.explorer.app.router.components": Folder<{
        desc: "Reusable UI chunks shared across panel views (accordion, ref-link wiring).";
        path: "packages/tskb/explorer-app/src/router/components";
      }>;
    }

    // ── Externals ──────────────────────────────────────────────────────────

    interface Externals {
      d3: External<{
        desc: "Data-visualisation library used for layout, zoom, and SVG drawing.";
        url: "https://d3js.org";
        kind: "npm-package";
      }>;
      vite: External<{
        desc: "Build tool that bundles the explorer SPA.";
        url: "https://vitejs.dev";
        kind: "npm-package";
      }>;
    }

    // ── Terms ──────────────────────────────────────────────────────────────

    interface Terms {
      knowledgeChunk: Term<"A JSON piece of the graph the SPA loads on demand. The meta chunk holds top-level info; one folder chunk per folder holds its contents.">;
      explorerLane: Term<"A horizontal band on the explorer canvas. Lanes group different kinds of nodes side by side.">;
      nodeComponent: Term<"The interface a node type implements to render itself on the canvas.">;
      lruChunkCache: Term<"A bounded cache inside the SPA. Keeps recently loaded chunks; drops the oldest when full.">;
      explorerStaticExport: Term<"A self-contained explorer folder that opens directly from the file system, no server needed.">;
      ghostNode: Term<"A placeholder node for a folder or file that exists on disk but isn't declared in the graph. Drawn as a faded card.">;
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
    explains="What is the tskb explorer and how does its data flow from CLI to browser?"
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
