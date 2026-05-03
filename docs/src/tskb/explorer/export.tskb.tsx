import { type Module, type Export, Doc, H1, H2, P, Flow, Step, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "explorer.export": Module<{
        desc: "Writes the explorer as a self-contained static folder.";
        type: typeof import("packages/tskb/src/core/explorer/export.js");
      }>;
    }

    interface Exports {
      "explorer.exportExplorer": Export<{
        desc: "Exports the explorer to a folder that opens from the file system.";
        type: typeof import("packages/tskb/src/core/explorer/export.js").exportExplorer;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ExportModule = ref as tskb.Modules["explorer.export"];
const ExportExplorerExport = ref as tskb.Exports["explorer.exportExplorer"];
const ExploreExport = ref as tskb.Exports["explorer.explore"];
const TransformGraphExport = ref as tskb.Exports["explorer.transformGraph"];
const StaticExportTerm = ref as tskb.Terms["explorerStaticExport"];
const ChunkTerm = ref as tskb.Terms["knowledgeChunk"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the explorer export to a static directory that opens from file://?">
    <H1>Explorer Static Export</H1>
    <P>
      {ExportExplorerExport} in {ExportModule} produces a {StaticExportTerm}: a directory containing
      the pre-built SPA (<code>index.html</code> + hashed JS/CSS assets) and all {ChunkTerm} JSON
      files written to a <code>chunks/</code> sub-directory.
    </P>

    <H2>Output layout</H2>
    <P>
      The default output directory is <code>.tskb/explorer/</code>. The structure mirrors what the
      server serves dynamically:
    </P>
    <P>
      <code>index.html</code>, <code>assets/</code> — Vite-built SPA with content-hashed filenames.
    </P>
    <P>
      <code>chunks/meta.json</code> — MetaChunk: root, top-level folders, docs, flows, terms,
      externals.
    </P>
    <P>
      <code>chunks/folder-&#123;sanitizedId&#125;.json</code> — one FolderChunk per folder with
      modules or sub-folders.
    </P>

    <H2>File:// compatibility</H2>
    <P>
      The SPA fetches chunks using relative paths (<code>./chunks/meta.json</code>) rather than
      absolute server routes. This means the exported output works when opened directly in a browser
      via <code>file://</code> without running a server, making it suitable for archiving or sharing
      as a zip.
    </P>

    <Flow
      name="explorer-export-flow"
      desc="Developer runs the explorer export command: the graph file is read, chunks are transformed in memory, then the pre-built SPA and chunk files are written to the output directory"
      priority="essential"
    >
      <Step
        node={ExploreExport}
        label="reads the graph file and resolves the output directory from the export flag"
      />
      <Step
        node={TransformGraphExport}
        label="converts KnowledgeGraph into a MetaChunk plus one FolderChunk per folder, held in memory"
      />
      <Step
        node={ExportExplorerExport}
        label="copies the pre-built SPA into the output directory and writes all chunk JSON files alongside it"
      />
    </Flow>
  </Doc>
);
