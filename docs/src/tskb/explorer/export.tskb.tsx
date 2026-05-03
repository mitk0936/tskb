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
      desc="tskb explore --export: reads graph.json, transforms chunks in memory, copies pre-built SPA from dist/explorer/ and writes chunk JSON files into the output directory (default: .tskb/explorer/)"
      priority="essential"
    >
      <Step
        node={ExploreExport}
        label="reads .tskb/graph.json; resolves output directory from --export flag (default: .tskb/explorer/)"
      />
      <Step
        node={TransformGraphExport}
        label="converts KnowledgeGraph → MetaChunk + one FolderChunk per folder, held in memory"
      />
      <Step
        node={ExportExplorerExport}
        label="copyDir: recursively copies dist/explorer/ (pre-built SPA inside the tskb package) into outputDir/ — produces outputDir/index.html and outputDir/assets/"
      />
      <Step
        node={ExportExplorerExport}
        label="writes all chunks as JSON: outputDir/chunks/meta.json and outputDir/chunks/folder-{sanitizedId}.json — one file per folder"
      />
    </Flow>
  </Doc>
);
