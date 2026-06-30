import { type Module, Doc, H1, H2, P, ref, val } from "tskb";

type Pkg = typeof import("../../../../packages/tskb/package.json");

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.app.vite-config": Module<{
        desc: "Vite config for the explorer SPA. Defines the production build and imports the dev-chunks plugin.";
        type: typeof import("packages/tskb/explorer-app/vite.config.js");
      }>;

      "explorer.app.plugins.dev-chunks": Module<{
        desc: "Vite plugin that serves the chunk API during local development. Only active in dev mode.";
        type: typeof import("packages/tskb/explorer-app/plugins/tskb-dev-chunks.js");
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ViteConfigModule = ref as tskb.Modules["explorer.app.vite-config"];
const DevChunksPlugin = ref as tskb.Modules["explorer.app.plugins.dev-chunks"];
const ViteExternal = ref as tskb.Externals["vite"];
const ExplorerAppFolder = ref as tskb.Folders["tskb.explorer.app"];
const TransformGraphExport = ref as tskb.Exports["explorer.transformGraph"];
const ServeExplorerExport = ref as tskb.Exports["explorer.serveExplorer"];
const LoadGraphExport = ref as tskb.Exports["cli.utils.graph-loader.loadGraph"];
const GraphTerm = ref as tskb.Terms["graph"];
const ChunkTerm = ref as tskb.Terms["knowledgeChunk"];
const SearchIndexTerm = ref as tskb.Terms["searchIndexChunk"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];
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
      A custom Vite plugin in {DevChunksPlugin} adds that API. It is imported by {ViteConfigModule}{" "}
      and only runs during <code>vite dev</code> (it declares <code>apply: "serve"</code>, so
      production builds skip it entirely). It mirrors the production server's chunk routes: it
      serves the <code>meta</code> chunk, the {SearchIndexTerm} at{" "}
      <code>/chunks/search-index.json</code>, and one <code>folder-*</code> {ChunkTerm} per folder.
      The plugin loads {TransformGraphExport} through Vite's <code>ssrLoadModule</code>, so it runs
      the transform straight from the TypeScript source — you do <strong>not</strong> need to run{" "}
      <code>build:lib</code> first.
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

    <H2>Constraint: activate reload-on-change</H2>
    <P>
      After transforming, the plugin must stamp <code>mode: "served"</code> and a{" "}
      <code>version</code> (e.g. <code>Date.now()</code>) on the meta chunk — the same fields{" "}
      {ServeExplorerExport} sets on the production server. The middleware must also handle a{" "}
      <code>/version</code> route returning <code>{`{ version }`}</code>. Without both, {MainModule}
      's <code>ReloadWatcher</code> stays inert: it only polls <code>/version</code> when{" "}
      <code>mode === "served"</code>, and only shows a reload dialog when the polled version differs
      from the page's baseline.
    </P>
    <P>
      Without this, when the build regenerates the graph and the plugin drops its cache, the browser
      has no signal to refetch — the developer must manually reload to see changes.
    </P>
  </Doc>
);
