import { type Module, type Export, Doc, H1, H2, P, Relation, Flow, Step, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.output.log-store": Module<{
        desc: "The run's single append-only timeline: owns the global sequence, keeps history, fans live entries to subscribers. Holds no formatting.";
        type: typeof import("packages/omkit/src/output/log/LogStore.js");
      }>;

      "omkit.output.raw-stream": Module<{
        desc: "Streams every entry to raw.jsonl live — the crash-insurance, machine-merge record.";
        type: typeof import("packages/omkit/src/output/log/RawStream.js");
      }>;

      "omkit.output.live-renderer": Module<{
        desc: "Renders curated milestones to the terminal as an in-place status line while the run goes.";
        type: typeof import("packages/omkit/src/output/LiveRenderer.js");
      }>;

      "omkit.output.writers.node-log": Module<{
        desc: "Finalize writer: projects the history into a per-action .log plus the root main.log.";
        type: typeof import("packages/omkit/src/output/writers/NodeLogWriter.js");
      }>;

      "omkit.output.writers.rollup": Module<{
        desc: "Finalize writer: slices the history by facet (events / asserts / snapshots) in global sequence order.";
        type: typeof import("packages/omkit/src/output/writers/RollupWriter.js");
      }>;

      "omkit.output.writers.result": Module<{
        desc: "Finalize writer: serializes the run tree and verdict to result.json.";
        type: typeof import("packages/omkit/src/output/writers/ResultWriter.js");
      }>;
    }

    interface Exports {
      "omkit.LogStore": Export<{
        desc: "The append-only timeline every node writes to; the source every output file projects from.";
        type: typeof import("packages/omkit/src/output/log/LogStore.js").LogStore;
      }>;

      "omkit.RawStream": Export<{
        desc: "Subscribes to the store and writes every entry to raw.jsonl, live, until the store closes.";
        type: typeof import("packages/omkit/src/output/log/RawStream.js").RawStream;
      }>;

      "omkit.LiveRenderer": Export<{
        desc: "Subscribes to the store and renders curated milestones to the terminal.";
        type: typeof import("packages/omkit/src/output/LiveRenderer.js").LiveRenderer;
      }>;

      "omkit.writeNodeLogs": Export<{
        desc: "Groups the history by node into a human .log per action, plus main.log for the root.";
        type: typeof import("packages/omkit/src/output/writers/NodeLogWriter.js").writeNodeLogs;
      }>;

      "omkit.writeRollup": Export<{
        desc: "Writes a cross-cutting rollup of one facet of the history, in global sequence order.";
        type: typeof import("packages/omkit/src/output/writers/RollupWriter.js").writeRollup;
      }>;

      "omkit.writeResult": Export<{
        desc: "Serializes the whole run tree and verdict to result.json.";
        type: typeof import("packages/omkit/src/output/writers/ResultWriter.js").writeResult;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const LogStoreExport = ref as tskb.Exports["omkit.LogStore"];
const RawStreamExport = ref as tskb.Exports["omkit.RawStream"];
const LiveRendererExport = ref as tskb.Exports["omkit.LiveRenderer"];
const WriteNodeLogsExport = ref as tskb.Exports["omkit.writeNodeLogs"];
const WriteRollupExport = ref as tskb.Exports["omkit.writeRollup"];
const WriteResultExport = ref as tskb.Exports["omkit.writeResult"];

const ActionRunExport = ref as tskb.Exports["omkit.ActionRun"];
const ExecutionTreeModule = ref as tskb.Modules["omkit.core.execution-tree"];
const RunFolderTerm = ref as tskb.Terms["run-folder"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does a run become its on-disk record?">
    <H1>Output pipeline</H1>
    <P>
      Everything a run produces — each action's output, events, asserts, snapshots, and lifecycle —
      lands on one append-only timeline, {LogStoreExport}. The store keeps raw truth: it stamps each
      entry with a run-global sequence number and holds no formatting. Every file omkit writes is a{" "}
      <em>projection</em> of that one timeline, read two ways — live, and again at finalize.
    </P>

    <H2>The live timeline</H2>
    <P>
      As the run goes, every node appends to {LogStoreExport}, which fans each entry out to
      subscribers. {RawStreamExport} writes them to <code>raw.jsonl</code> the moment they land —
      the crash-insurance record, complete even if the process is killed mid-run.{" "}
      {LiveRendererExport} renders curated milestones to the terminal as an in-place status line.
      Both read the same store; neither is the source of truth.
    </P>

    <Relation from={ActionRunExport} to={LogStoreExport} label="appends every entry to" />
    <Relation from={RawStreamExport} to={LogStoreExport} label="streams raw.jsonl live from" />
    <Relation
      from={LiveRendererExport}
      to={LogStoreExport}
      label="renders terminal milestones from"
    />

    <H2>The finalize projections</H2>
    <P>
      When the run tears down, {ExecutionTreeModule} closes the store, drains the live streams, then
      projects the full history into the {RunFolderTerm}. {WriteNodeLogsExport} groups entries by
      node into a human <code>.log</code> per action plus <code>main.log</code> (the root, carrying
      the legend and end-of-run summary). {WriteRollupExport} slices the same history by facet —{" "}
      <code>events.log</code>, <code>asserts.log</code>, <code>snapshots.log</code> — in global
      sequence order. {WriteResultExport} serializes the run tree and verdict to{" "}
      <code>result.json</code>. Because every entry carries that global sequence, all of these files
      merge back into one order.
    </P>

    <Flow
      name="omkit-finalize"
      desc="On teardown the ExecutionTree closes the log store and projects its history into the run folder's files"
    >
      <Step node={ExecutionTreeModule} label="closes the store and drains the live streams" />
      <Step node={WriteNodeLogsExport} label="writes per-action .log files and main.log" />
      <Step node={WriteRollupExport} label="writes events / asserts / snapshots rollups" />
      <Step node={WriteResultExport} label="serializes the run tree and verdict to result.json" />
    </Flow>

    <H2>One timeline, many views</H2>
    <P>
      The store carries no presentation — writers apply headers and prefixes at read time. That
      single separation is why the same run can be a live terminal status line, a machine-readable{" "}
      <code>raw.jsonl</code>, per-action human logs, cross-cutting rollups, and a structured{" "}
      <code>result.json</code> all at once: each is just a different projection of one append-only
      sequence.
    </P>
  </Doc>
);
