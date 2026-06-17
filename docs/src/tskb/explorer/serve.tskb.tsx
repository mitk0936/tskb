import { type Module, type Export, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.server": Module<{
        desc: "HTTP server for the explorer. Serves the SPA and the chunk API.";
        type: typeof import("packages/tskb/src/core/explorer/server.js");
      }>;

      "cli.commands.explore": Module<{
        desc: "The `tskb explore` command.";
        type: typeof import("packages/tskb/src/cli/commands/explore.js");
      }>;
    }

    interface Exports {
      "explorer.serveExplorer": Export<{
        desc: "Starts the explorer HTTP server.";
        type: typeof import("packages/tskb/src/core/explorer/server.js").serveExplorer;
      }>;

      "explorer.explore": Export<{
        desc: "Runs the `tskb explore` command — serves the SPA, or exports it as static files with `--export`.";
        type: typeof import("packages/tskb/src/cli/commands/explore.js").explore;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ServerModule = ref as tskb.Modules["explorer.server"];
const ExploreCommandModule = ref as tskb.Modules["cli.commands.explore"];
const ServeExplorerExport = ref as tskb.Exports["explorer.serveExplorer"];
const ExploreExport = ref as tskb.Exports["explorer.explore"];
const TransformGraphExport = ref as tskb.Exports["explorer.transformGraph"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];
const LaneEngineModule = ref as tskb.Modules["explorer.spa.lane-engine"];
const NodeBaseModule = ref as tskb.Modules["explorer.spa.node-base"];
const GraphFinderModule = ref as tskb.Modules["cli.utils.graph-finder"];
const ChunkTerm = ref as tskb.Terms["knowledgeChunk"];
const GraphWriterModule = ref as tskb.Modules["graph.writer"];
const BuildCommandModule = ref as tskb.Modules["cli.commands.build"];
const ExportExplorerExport = ref as tskb.Exports["explorer.exportExplorer"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the explorer HTTP server serve chunks and SPA assets?">
    <H1>Explorer Server</H1>
    <P>
      {ServeExplorerExport} in {ServerModule} starts a Node built-in <code>http</code> server — no
      external dependency. It runs the graph transform at startup, serializes every {ChunkTerm} to
      JSON, and keeps all of them in a <code>Map&lt;string, string&gt;</code>. Subsequent chunk
      requests are pure string writes with no re-serialization. The cache is rebuilt only when the
      graph changes on disk (see <strong>Reload on change</strong> below).
    </P>

    <H2>Request routing</H2>
    <P>Three routes are handled:</P>
    <P>
      <strong>/chunks/*.json</strong> — chunk API. The key is extracted from the pathname (e.g.{" "}
      <code>meta</code> or <code>folder-tskb.core</code>) and looked up in the in-memory cache. A
      404 is returned if the key is unknown.
    </P>
    <P>
      <strong>/version</strong> — returns <code>{`{ version }`}</code>, the current{" "}
      <code>meta.json</code> mtime. The browser polls this to detect a rebuild (see below).
    </P>
    <P>
      <strong>/* (static assets)</strong> — SPA files are served from <code>dist/explorer/</code>,
      resolved via <code>import.meta.url</code> so the path stays correct after{" "}
      <code>npm pack</code>. Any unknown path falls back to <code>index.html</code> so the SPA
      router handles client-side navigation. A path traversal guard rejects any request that
      resolves outside <code>dist/explorer/</code>.
    </P>

    <H2>Command entry point</H2>
    <P>
      {ExploreExport} in {ExploreCommandModule} locates <code>graph.json</code> via{" "}
      {GraphFinderModule}, parses it, then branches: if <code>--export</code> is provided it calls{" "}
      {ExportExplorerExport}; otherwise it calls {ServeExplorerExport}. The module is dynamically
      imported so the SPA assets directory is only resolved when actually needed.
    </P>

    <H2>Reload on change</H2>
    <P>
      When serving (not exporting), {ServeExplorerExport} polls <code>meta.json</code>'s mtime once
      a second. It polls rather than <code>fs.watch</code>-ing the directory because{" "}
      {BuildCommandModule} deletes and recreates the whole <code>.tskb/</code> directory on every
      build — a recursive watch bound to the old directory goes dead the moment it is removed, while
      a <code>stat</code> follows the path and survives the recreate. Because {GraphWriterModule}{" "}
      writes files atomically and writes <code>meta.json</code> last, a changed mtime is a reliable
      signal that a complete new graph is on disk. On that signal the server reloads the graph and
      rebuilds its chunk cache, so a browser reload fetches fresh chunks.
    </P>
    <P>
      The served {ChunkTerm} for <code>meta</code> is stamped with <code>mode: "served"</code> and a{" "}
      <code>version</code> (the <code>meta.json</code> mtime); the static export instead stamps{" "}
      <code>mode: "static"</code>. In the browser, {MainModule} starts a <code>ReloadWatcher</code>{" "}
      that polls <code>/version</code> only when <code>mode === "served"</code> and shows a reload
      dialog when the version changes. In the static export the watcher is inert, so the same SPA
      build works for both.
    </P>

    <Flow
      name="explorer-serve-flow"
      desc="Developer runs `tskb explore`: the CLI loads the graph, transforms it into chunks, starts an HTTP server, and the browser loads the SPA and fetches chunks on demand"
      priority="essential"
    >
      <Step node={ExploreExport} label="loads the graph file and routes to the serve path" />
      <Step
        node={TransformGraphExport}
        label="converts the KnowledgeGraph into a MetaChunk and one FolderChunk per folder, held in memory"
      />
      <Step
        node={ServeExplorerExport}
        label="starts the HTTP server: chunk routes serve the in-memory chunks as JSON; everything else serves the SPA assets"
      />
      <Step
        node={MainModule}
        label="ExplorerApp mounts on page load: sets up canvas, renderer, and search, then fetches the meta chunk"
      />
      <Step node={LaneEngineModule} label="positions all visible nodes across the three lanes" />
      <Step node={NodeBaseModule} label="D3 enter/update renders node cards into SVG groups" />
    </Flow>
  </Doc>
);
