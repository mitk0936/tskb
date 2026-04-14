import { type Module, type Export, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.server": Module<{
        desc: "Node built-in HTTP server that serves the pre-built SPA assets and generates chunk JSON responses on demand. Reads graph.json once, transforms it, and caches all chunk JSON strings in memory for the lifetime of the process.";
        type: typeof import("packages/tskb/src/core/explorer/server.js");
      }>;

      "cli.commands.explore": Module<{
        desc: "Entry point for `tskb explore`: loads graph.json, then either serves locally or exports static files depending on --export flag";
        type: typeof import("packages/tskb/src/cli/commands/explore.js");
      }>;
    }

    interface Exports {
      "explorer.serveExplorer": Export<{
        desc: "Starts a Node http server that serves the pre-built SPA + chunk API. Resolves SPA assets via import.meta.url so it works after npm pack. Optionally auto-opens the browser.";
        type: typeof import("packages/tskb/src/core/explorer/server.js").serveExplorer;
      }>;

      "explorer.explore": Export<{
        desc: "CLI command handler: finds graph.json via graph-finder, branches to serveExplorer or exportExplorer based on --export flag";
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

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="Explorer HTTP server: chunk API, in-memory cache, SPA asset serving, auto-open browser">
    <H1>Explorer Server</H1>
    <P>
      {ServeExplorerExport} in {ServerModule} starts a Node built-in <code>http</code> server — no
      external dependency. It runs the graph transform once at startup, serializes every {ChunkTerm}{" "}
      to JSON, and keeps all of them in a <code>Map&lt;string, string&gt;</code> for the lifetime of
      the process. Subsequent chunk requests are pure string writes with no re-serialization.
    </P>

    <H2>Request routing</H2>
    <P>Two routes are handled:</P>
    <P>
      <strong>/chunks/*.json</strong> — chunk API. The key is extracted from the pathname (e.g.{" "}
      <code>meta</code> or <code>folder-tskb.core</code>) and looked up in the in-memory cache. A
      404 is returned if the key is unknown.
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
      <code>exportExplorer</code>; otherwise it calls {ServeExplorerExport}. The module is
      dynamically imported so the SPA assets directory is only resolved when actually needed.
    </P>

    <Flow
      name="explorer-serve-flow"
      desc="tskb explore: CLI finds graph, transforms chunks, starts HTTP server, browser loads SPA and fetches chunks on demand"
      priority="essential"
    >
      <Step node={ExploreExport} label="Reads graph.json, branches on --export flag" />
      <Step
        node={TransformGraphExport}
        label="Converts KnowledgeGraph into MetaChunk + FolderChunks, serializes all to JSON strings"
      />
      <Step
        node={ServeExplorerExport}
        label="Starts http server: /chunks/*.json reads from in-memory cache; /* serves SPA assets"
      />
      <Step
        node={MainModule}
        label="ExplorerApp.mount(): setupCanvas (D3 SVG + zoom/pan), setupRenderer, setupSearch, then loadInitialData fetches meta.json"
      />
      <Step
        node={LaneEngineModule}
        label="computeLayout() positions all visible nodes across three lanes"
      />
      <Step node={NodeBaseModule} label="D3 enter/update renders node cards into SVG groups" />
    </Flow>
  </Doc>
);
