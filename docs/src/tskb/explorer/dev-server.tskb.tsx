import { type Module, Doc, H1, H2, P, ref, val } from "tskb";

type Pkg = typeof import("../../../../packages/tskb/package.json");

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.app.vite-config": Module<{
        desc: "Vite config for the explorer SPA. Builds the production bundle and, in dev, serves the chunk API from the live graph.";
        type: typeof import("packages/tskb/explorer-app/vite.config.js");
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ViteConfigModule = ref as tskb.Modules["explorer.app.vite-config"];
const ViteExternal = ref as tskb.Externals["vite"];
const ExplorerAppFolder = ref as tskb.Folders["tskb.explorer.app"];
const TransformGraphExport = ref as tskb.Exports["explorer.transformGraph"];
const ServeExplorerExport = ref as tskb.Exports["explorer.serveExplorer"];
const LoadGraphExport = ref as tskb.Exports["cli.utils.graph-loader.loadGraph"];
const GraphTerm = ref as tskb.Terms["graph"];
const ChunkTerm = ref as tskb.Terms["knowledgeChunk"];
const SearchIndexTerm = ref as tskb.Terms["searchIndexChunk"];
const DevExplorerScript = val as Extract<keyof Pkg["scripts"], "dev:explorer">;

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="How does the explorer dev server serve graph chunks while developing the SPA?"
    priority="constraint"
  >
    <H1>Explorer dev server</H1>
    <P>
      During development the SPA in {ExplorerAppFolder} is served by {ViteExternal}'s own dev server
      (with HMR), not by the production Node server ({ServeExplorerExport}). You start it with{" "}
      <code>npm run {DevExplorerScript}</code>. The SPA still fetches its data from{" "}
      <code>/chunks/*.json</code>, so the dev server has to provide that chunk API itself.
    </P>
    <P>
      A custom Vite plugin, <code>tskb-dev-chunks</code> in {ViteConfigModule}, adds that API. It
      mirrors the production server's chunk routes: it serves the <code>meta</code> chunk, the{" "}
      {SearchIndexTerm} at <code>/chunks/search-index.json</code>, and one <code>folder-*</code>{" "}
      {ChunkTerm} per folder. The plugin loads {TransformGraphExport} through Vite's{" "}
      <code>ssrLoadModule</code>, so it runs the transform straight from the TypeScript source — you
      do <strong>not</strong> need to run <code>build:lib</code> first.
    </P>

    <H2>Constraint: feed the transform the full graph</H2>
    <P>
      {TransformGraphExport} needs the whole {GraphTerm} — nodes <em>and</em> edges. The build
      writes the graph as separate files under <code>.tskb/graph/</code> (one per node type, plus{" "}
      <code>edges.json</code>), so the plugin must reassemble the full graph from all of those
      files, the same way {LoadGraphExport} does. <code>meta.json</code> alone is only the metadata
      (project name, stats); passing it to the transform throws <code>"edges is not iterable"</code>{" "}
      and every chunk request returns a 500.
    </P>
    <P>
      The transformed chunks are cached in memory. The plugin watches <code>meta.json</code>{" "}
      (written last by the build) and drops the cache when it changes, so the next request re-reads
      the graph and re-transforms it.
    </P>
  </Doc>
);
