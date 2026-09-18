import { type Module, type Export, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.output.artifact-store": Module<{
        desc: "The run's curated artifacts — files labelled via ctx.artifact, in registration order. Holds no I/O of its own.";
        type: typeof import("packages/omkit/src/output/artifact/ArtifactStore.js");
      }>;
    }

    interface Exports {
      "omkit.ArtifactStore": Export<{
        desc: "Holds one run's curated artifact registrations, in registration order.";
        type: typeof import("packages/omkit/src/output/artifact/ArtifactStore.js").ArtifactStore;
      }>;

      "omkit.OmContext": Export<{
        desc: "What the om body receives — the run-level counterpart to ActionContext, with the same assert/snapshot/artifact surface at the root.";
        type: import("packages/omkit/src/core/types.js").OmContext;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ArtifactStoreModule = ref as tskb.Modules["omkit.output.artifact-store"];
const ArtifactStoreExport = ref as tskb.Exports["omkit.ArtifactStore"];
const OmContextExport = ref as tskb.Exports["omkit.OmContext"];
const ActionContextExport = ref as tskb.Exports["omkit.ActionContext"];

const ExecutionTreeModule = ref as tskb.Modules["omkit.core.execution-tree"];
const LogStoreExport = ref as tskb.Exports["omkit.LogStore"];
const WriteRollupExport = ref as tskb.Exports["omkit.writeRollup"];
const WriteResultExport = ref as tskb.Exports["omkit.writeResult"];
const RunFolderTerm = ref as tskb.Terms["run-folder"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does a run label the files it produces?">
    <H1>Curated artifacts</H1>
    <P>
      Both {ActionContextExport} and {OmContextExport} give the body two ways to put a file on
      record. <code>ctx.snapshot(name, value)</code> does the writing itself — it serializes a JSON
      value to a file under the run folder and returns that file's path.{" "}
      <code>ctx.artifact(name, file, opts?)</code> does no writing at all: it only labels a file the
      body already wrote (or is about to), inferring a MIME type from the extension, and hands back
      the file's path. Write the file under <code>ctx.artifactsFolder</code>, then label it.
    </P>

    <H2>ctx.artifact vs ctx.snapshot</H2>
    <P>
      The path handed to <code>ctx.artifact</code> need not already be absolute —{" "}
      {ArtifactStoreExport} resolves it before storing it, the same way <code>path.resolve</code>{" "}
      would against the process's working directory. That is why the "absolute path" a caller gets
      back is reliable everywhere the record is read again: the return value, the timeline line, and
      every rollup on disk agree.
    </P>

    <Relation
      from={ActionContextExport}
      to={ArtifactStoreExport}
      label="registers artifacts into"
    />
    <Relation from={OmContextExport} to={ArtifactStoreExport} label="registers artifacts into" />

    <H2>Where a registration lands</H2>
    <P>
      Every <code>ctx.artifact</code> call does two things: it appends a record to{" "}
      {ArtifactStoreExport} in {ArtifactStoreModule}, and it drops a line onto {LogStoreExport}, the
      run's single timeline. {WriteRollupExport} projects that timeline into{" "}
      <code>artifacts.log</code> the same way it builds <code>events.log</code> and{" "}
      <code>asserts.log</code> — a full chronological journal that keeps every call, unaffected by
      anything downstream. {ExecutionTreeModule} instead projects {ArtifactStoreExport} itself into{" "}
      {WriteResultExport}'s <code>result.json</code>, and there it collapses the list, keyed by{" "}
      <strong>the registering node and the name together</strong> — not the name alone. One action
      re-labelling a name it already used updates that entry in place. Two different actions that
      each independently choose the same name (two screenshot steps both calling{" "}
      <code>ctx.artifact("screenshot", …)</code>) describe two distinct files, and both survive into{" "}
      <code>result.json</code> rather than one clobbering the other.
    </P>

    <Relation
      from={ExecutionTreeModule}
      to={ArtifactStoreExport}
      label="dedupes by (node, name) into result.json"
    />

    <H2>Curation is a label, not a gate</H2>
    <P>
      A file the body never labels still exists under the {RunFolderTerm} and stays visible to
      anything enumerating it. Curation raises signal for a reader — or an assistant — skimming{" "}
      <code>result.json</code>; it does not restrict what the run folder holds.
    </P>
  </Doc>
);
