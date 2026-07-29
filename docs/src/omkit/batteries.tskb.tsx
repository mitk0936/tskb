import { type Export, Doc, H1, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Exports {
      "omkit.command": Export<{
        desc: "Battery: run a shell command as an action, streaming its output into the run.";
        type: typeof import("packages/omkit/src/actions/index.js").command;
      }>;
      "omkit.watch": Export<{
        desc: "Battery: react to file changes as an action.";
        type: typeof import("packages/omkit/src/actions/index.js").watch;
      }>;
      "omkit.healthcheck": Export<{
        desc: "Battery: wait until a service reports healthy before moving on.";
        type: typeof import("packages/omkit/src/actions/index.js").healthcheck;
      }>;
      "omkit.portFree": Export<{
        desc: "Battery: wait until nothing is listening on a TCP port, so a restart can rebind without racing the old process.";
        type: typeof import("packages/omkit/src/actions/index.js").portFree;
      }>;
      "omkit.prompt": Export<{
        desc: "Battery: ask the user a question mid-run (answered in-terminal, or over the channel when supervised).";
        type: typeof import("packages/omkit/src/actions/index.js").prompt;
      }>;
      // omkit.chromePage is declared in capability-handoff.tskb.tsx — referenced here, not redeclared.
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ActionsFolder = ref as tskb.Folders["omkit.actions"];
const ActionsIndex = ref as tskb.Modules["omkit.actions.index"];
const ActionExport = ref as tskb.Exports["omkit.action"];
const CapabilityTerm = ref as tskb.Terms["capability"];

const Command = ref as tskb.Exports["omkit.command"];
const Watch = ref as tskb.Exports["omkit.watch"];
const Healthcheck = ref as tskb.Exports["omkit.healthcheck"];
const PortFree = ref as tskb.Exports["omkit.portFree"];
const Prompt = ref as tskb.Exports["omkit.prompt"];
const ChromePage = ref as tskb.Exports["omkit.chromePage"];

const PlaywrightExternal = ref as tskb.Externals["playwright-core"];
const ZxExternal = ref as tskb.Externals["zx"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="What are batteries (the actions in omkit/actions)?" priority="supplementary">
    <H1>Batteries</H1>
    <P>
      Batteries are ready-made {ActionExport}s that ship with omkit for the workflow steps almost
      every run needs, so you wire them together instead of writing them from scratch.{" "}
      {ActionsIndex} re-exports them from {ActionsFolder}: {Command} runs a shell command, {Watch}{" "}
      reacts to file changes, {Healthcheck} waits until a service is up, {Prompt} asks the user a
      question, and {ChromePage} drives a browser. They are ordinary actions — same
      launch-and-observe shape, same {CapabilityTerm} handoff — just written once and shared.
    </P>
    <P>
      Gates come in pairs, because a dev stack has to both start and stop. {Healthcheck} waits for a
      service to answer; {PortFree} waits for one to let go of its TCP port — the check a restart
      needs before it rebinds, since a killed process can hold its socket well after the run has
      moved on. It probes by connecting: only a refused connection proves nobody is listening, so a
      filtered or unreachable port reads as still busy rather than falsely free.
    </P>

    <Relation from={Command} to={ZxExternal} label="runs shell commands through" />
    <Relation from={ChromePage} to={PlaywrightExternal} label="drives a browser through" />
  </Doc>
);
