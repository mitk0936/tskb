import {
  type Folder,
  type Module,
  type Export,
  type External,
  type Term,
  Doc,
  H1,
  H2,
  P,
  Relation,
  Flow,
  Step,
  ref,
} from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Folders {
      omkit: Folder<{
        desc: "The operational-model kit: a Node runtime for the workflows around your code (start servers, wait, watch, drive a browser, tear down) that narrates each run to disk.";
        path: "packages/omkit";
        boundary: "omkit runtime";
      }>;

      "omkit.core": Folder<{
        desc: "The execution model: om, action, step, and the internal ExecutionTree engine that runs them.";
        path: "packages/omkit/src/core";
      }>;

      "omkit.actions": Folder<{
        desc: "Batteries — reusable actions built on the core engine (command, watch, healthcheck, prompt, chromePage).";
        path: "packages/omkit/src/actions";
      }>;

      "omkit.output": Folder<{
        desc: "The run's on-disk record: log store, run folder, snapshots, and the writers that produce result.json / raw.jsonl / per-action logs.";
        path: "packages/omkit/src/output";
      }>;

      "omkit.foundation": Folder<{
        desc: "Small primitives shared across omkit: deferreds, an async queue, ids, call-site capture, event emitters.";
        path: "packages/omkit/src/foundation";
      }>;

      "omkit.system": Folder<{
        desc: "The OS edge: child-process spawning and the process registry that kills everything on teardown.";
        path: "packages/omkit/src/system";
      }>;
    }

    interface Modules {
      "omkit.index": Module<{
        desc: "The curated public surface: om, action, step, CancelledError. The ExecutionTree engine is deliberately not exported.";
        type: typeof import("packages/omkit/src/index.js");
      }>;

      "omkit.core.om": Module<{
        desc: "om(name, body) — hosts a linear orchestration as the root of one run.";
        type: typeof import("packages/omkit/src/core/om.js");
      }>;

      "omkit.core.action": Module<{
        desc: "action(name) — the builder for a typed, launchable unit of work.";
        type: typeof import("packages/omkit/src/core/action.js");
      }>;

      "omkit.core.step": Module<{
        desc: "step(name, fn) — an inline, one-off action with no reusable definition.";
        type: typeof import("packages/omkit/src/core/step.js");
      }>;

      "omkit.core.types": Module<{
        desc: "The core type surface: Action, Activity, ActionContext, OmContext.";
        type: typeof import("packages/omkit/src/core/types.js");
      }>;

      "omkit.core.execution-tree": Module<{
        desc: "The run engine (internal): owns the node registry, the shared log, and process-wide teardown. Not exported.";
        type: typeof import("packages/omkit/src/core/ExecutionTree.js");
      }>;

      "omkit.actions.index": Module<{
        desc: "Public re-exports of the batteries in omkit/actions.";
        type: typeof import("packages/omkit/src/actions/index.js");
      }>;

      "omkit.output.run-folder": Module<{
        desc: "Resolves and owns a run's output directory under logs/<name>-<hash8>/<date>/<time>/.";
        type: typeof import("packages/omkit/src/output/folder/RunFolder.js");
      }>;
    }

    interface Exports {
      "omkit.om": Export<{
        desc: "Runs a linear orchestration as the root of one run. The name plus the defining file identify the run.";
        type: typeof import("packages/omkit/src/index.js").om;
      }>;

      "omkit.action": Export<{
        desc: "Defines a typed action. Calling the result launches it and returns a live Activity.";
        type: typeof import("packages/omkit/src/index.js").action;
      }>;

      "omkit.step": Export<{
        desc: "Runs a one-off inline action as its own node.";
        type: typeof import("packages/omkit/src/index.js").step;
      }>;

      "omkit.Activity": Export<{
        desc: "The live handle returned by launching an action: configure it (withCache, tag) and observe it (result, ref, events).";
        type: import("packages/omkit/src/core/types.js").Activity;
      }>;
    }

    interface Externals {
      "playwright-core": External<{
        desc: "Browser automation library. The chromePage battery attaches to Chrome over CDP and hands downstream steps a live Page.";
        url: "https://playwright.dev";
        kind: "npm-package";
      }>;

      zx: External<{
        desc: "Shell-scripting library. The command battery spawns and streams shell commands through it.";
        url: "https://github.com/google/zx";
        kind: "npm-package";
      }>;
    }

    interface Terms {
      capability: Term<"A typed value one action publishes with attach() and downstream actions receive by awaiting .ref — a runtime handoff (a port, a client, a live page), not a string scraped from a log.">;
      "run-folder": Term<"A run's on-disk record at logs/<name>-<hash8>/<date>/<time>/: result.json (the tree and verdict), raw.jsonl (every entry), and per-action .log files. Its identity is keyed by the om's name and the file that defines it.">;
      "structured-supervision": Term<"omkit's failure model: an activity whose failure nobody observes tears the whole run down. Observing it — awaiting .result/.ref/.once (which reject on failure), a .result.catch, or an on('error') listener — makes the failure yours to handle instead.">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const OmkitFolder = ref as tskb.Folders["omkit"];
const CoreFolder = ref as tskb.Folders["omkit.core"];
const ActionsFolder = ref as tskb.Folders["omkit.actions"];
const OutputFolder = ref as tskb.Folders["omkit.output"];

const OmkitIndex = ref as tskb.Modules["omkit.index"];
const ExecutionTreeModule = ref as tskb.Modules["omkit.core.execution-tree"];
const RunFolderModule = ref as tskb.Modules["omkit.output.run-folder"];
const ActionsIndexModule = ref as tskb.Modules["omkit.actions.index"];

const OmExport = ref as tskb.Exports["omkit.om"];
const ActionExport = ref as tskb.Exports["omkit.action"];
const StepExport = ref as tskb.Exports["omkit.step"];
const ActivityExport = ref as tskb.Exports["omkit.Activity"];

const CapabilityTerm = ref as tskb.Terms["capability"];
const RunFolderTerm = ref as tskb.Terms["run-folder"];
const SupervisionTerm = ref as tskb.Terms["structured-supervision"];

const PlaywrightExternal = ref as tskb.Externals["playwright-core"];
const ZxExternal = ref as tskb.Externals["zx"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="What is omkit and what does it provide?" priority="essential">
    <H1>omkit</H1>
    <P>
      {OmkitFolder} is the operational layer to tskb's knowledge layer: where tskb records what a
      system <em>is</em>, omkit runs what it is <em>doing right now</em>. You write the
      orchestration as ordinary TypeScript — <code>await</code>, <code>if</code>, loops — and the
      run narrates itself to disk as a structured record a human can skim and an AI assistant can
      verify against, instead of guessing from terminal scrollback.
    </P>
    <P>
      The public surface in {OmkitIndex} is small and curated: {OmExport} hosts a run,{" "}
      {ActionExport} defines a typed unit of work, and {StepExport} runs a one-off inline unit.
      Everything else — the engine that supervises them — stays internal.
    </P>

    <H2>The model</H2>
    <P>
      An action is a named, typed description of work; <em>calling</em> it launches it and returns a
      live {ActivityExport}. Actions don't share globals — one publishes a {CapabilityTerm} that the
      next receives by awaiting <code>.ref</code>, so steps chain by typed handoff rather than
      string parsing. An activity's <code>.result</code> resolves the value and <em>rejects</em> on
      failure — the same reject-on-failure shape as <code>.ref</code> and <code>.once</code> — so a
      single <code>try/catch</code> gates a step and a <code>.result.catch(…)</code> handles a
      failure without stopping the run.
    </P>
    <P>
      Failure is governed by {SupervisionTerm}, and success is keep-alive — when the {OmExport} body
      returns, the daemons it started keep running until Ctrl+C or <code>cancel()</code>, so wiring
      things up doesn't kill the servers you just started.
    </P>

    <Relation from={OmExport} to={ExecutionTreeModule} label="runs as the root of" />
    <Relation from={ActionExport} to={ActivityExport} label="launches" />
    <Relation from={ExecutionTreeModule} to={RunFolderModule} label="writes the run to" />
    <Relation from={ActionsIndexModule} to={PlaywrightExternal} label="drives a browser through" />
    <Relation from={ActionsIndexModule} to={ZxExternal} label="runs shell commands through" />

    <H2>The run, on disk</H2>
    <P>
      Every run produces a {RunFolderTerm} — a machine-readable account of what launched, what came
      up, what failed, and what the world looked like. Its stable identity means a script or an
      assistant can always find "the latest run" of a given {OmExport} without parsing scrollback.
    </P>

    <Flow
      name="omkit-run"
      desc="An om(name, body) call hosts a run: actions launch as nodes, the engine supervises them and the shared log, and the run folder captures the record"
      priority="essential"
    >
      <Step node={OmExport} label="hosts the orchestration as the run root" />
      <Step node={ActionExport} label="each call launches a node under the run" />
      <Step node={ExecutionTreeModule} label="supervises the nodes and the shared log" />
      <Step node={RunFolderModule} label="writes result.json, raw.jsonl, and per-action logs" />
    </Flow>

    <H2>Areas</H2>
    <P>
      {CoreFolder} holds the execution model; {ActionsFolder} holds the batteries built on it; and{" "}
      {OutputFolder} turns a run into its on-disk record.
    </P>
  </Doc>
);
