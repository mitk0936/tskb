import { type Module, type Export, Doc, H1, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.spa.chunk-types": Module<{
        desc: "Type definitions for the chunks the SPA loads.";
        type: typeof import("packages/tskb/explorer-app/src/graph/chunk-types.js");
      }>;

      "explorer.spa.loader": Module<{
        desc: "Loads chunks. Caches recent ones; de-duplicates parallel requests.";
        type: typeof import("packages/tskb/explorer-app/src/graph/loader.js");
      }>;

      "explorer.spa.store": Module<{
        desc: "Holds the loaded graph data for the SPA.";
        type: typeof import("packages/tskb/explorer-app/src/store/graph-store.js");
      }>;
    }

    interface Exports {
      "explorer.spa.ChunkLoader": Export<{
        desc: "Loads chunks for the SPA.";
        type: typeof import("packages/tskb/explorer-app/src/graph/loader.js").ChunkLoader;
      }>;

      "explorer.spa.GraphStore": Export<{
        desc: "Holds loaded graph data and notifies subscribers when it changes.";
        type: typeof import("packages/tskb/explorer-app/src/store/graph-store.js").GraphStore;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ChunkTypesModule = ref as tskb.Modules["explorer.spa.chunk-types"];
const LoaderModule = ref as tskb.Modules["explorer.spa.loader"];
const StoreModule = ref as tskb.Modules["explorer.spa.store"];
const MainModule = ref as tskb.Modules["explorer.spa.main"];
const ChunkLoaderExport = ref as tskb.Exports["explorer.spa.ChunkLoader"];
const GraphStoreExport = ref as tskb.Exports["explorer.spa.GraphStore"];
const ComputeLayoutExport = ref as tskb.Exports["explorer.spa.computeLayout"];
const RenderStructureEdgesExport = ref as tskb.Exports["explorer.spa.renderStructureEdges"];
const BaseNodeRendererExport = ref as tskb.Exports["explorer.spa.BaseNodeRenderer"];
const LruCacheTerm = ref as tskb.Terms["lruChunkCache"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the SPA load and cache graph chunks?">
    <H1>Data layer</H1>
    <P>
      {ChunkTypesModule} defines the chunk discriminated union (<code>MetaChunk | FolderChunk</code>
      ) and the <code>ChunkRegistry</code> map that keys chunk kinds to their types. Adding a new
      chunk kind means extending this file only.
    </P>
    <P>
      {LoaderModule} provides {ChunkLoaderExport}: a generic <code>load(kind, ...args)</code> whose
      return type is inferred from <code>ChunkRegistry[K]</code>. It deduplicates in-flight requests
      and uses a {LruCacheTerm} (max 50 entries) so folders are not re-fetched on collapse/expand
      cycles.
    </P>
    <P>
      {GraphStoreExport} in {StoreModule} holds only graph data (meta chunk, folder chunks map).
      Data arrives via <code>loadMeta()</code> and <code>loadFolderChunk()</code>. UI state — the
      expanded node set, selected node, and search query — lives as plain variables in {MainModule}{" "}
      and is passed explicitly to {ComputeLayoutExport}, {RenderStructureEdgesExport}, and{" "}
      {BaseNodeRendererExport}. The store exposes <code>subscribe(listener)</code> for reactive
      re-render.
    </P>

    <Relation from={StoreModule} to={ChunkTypesModule} label="stores chunks typed by" />
    <Relation from={LoaderModule} to={ChunkTypesModule} label="types fetch results via" />
    <Relation from={MainModule} to={StoreModule} label="subscribes to" />
  </Doc>
);
