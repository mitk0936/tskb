import { type Export, Doc, H1, H2, P, Relation, Snippet, Flow, Step, ref } from "tskb";
import { createOmkitClient } from "packages/omkit/src/client/index.js";

// ─── Refs ─────────────────────────────────────────────────────────────────────
// All nodes referenced here are declared in client.tskb.tsx (the client layer) and
// main.tskb.tsx (the core/interaction module) — the registry merges across files.

declare global {
  namespace tskb {
    interface Exports {
      "omkit.runBare": Export<{
        desc: "Runs an om bare — inherited stdio, no supervision — and resolves its exit code; the om owns the terminal.";
        type: import("packages/omkit/src/client/index.js").OmkitClient["runBare"];
      }>;
    }
  }
}

const RunnerModule = ref as tskb.Modules["omkit.client.runner"];
const InteractionModule = ref as tskb.Modules["omkit.core.interaction"];
const ClientExport = ref as tskb.Exports["omkit.OmkitClient"];
const RunSessionExport = ref as tskb.Exports["omkit.RunSession"];
const RunBareExport = ref as tskb.Exports["omkit.runBare"];
const UiFolder = ref as tskb.Folders["omkit.cli.ui"];
const ChannelModule = ref as tskb.Modules["omkit.client.channel"];
const SupervisorExport = ref as tskb.Exports["omkit.core.Supervisor"];
const ExecutionTreeModule = ref as tskb.Modules["omkit.core.execution-tree"];

const SupervisedRun = ref as tskb.Terms["supervised-run"];
const BareRun = ref as tskb.Terms["bare-run"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="What's the difference between a supervised run and a bare run, and why are there two?"
    priority="supplementary"
  >
    <H1>Supervised vs bare runs</H1>
    <P>
      {ClientExport} runs an om two ways, and {RunnerModule} forks both the same way — the om file
      through the tsx loader. The difference is what happens to its input and output, and whether a
      frontend is listening.
    </P>

    <H2>Supervised — the frontend is in control</H2>
    <P>
      A {SupervisedRun} pipes the child's stdio and opens an IPC channel to it. The child's logs,
      prompts, and final verdict travel up that channel as messages instead of being printed, so the
      frontend renders them itself and answers prompts on the child's behalf. This is how the{" "}
      {UiFolder} app watches a run: the om must not scribble on the terminal the Ink app is drawing
      to, so it is kept quiet and observed. A supervised run hands back a {RunSessionExport}.
    </P>

    <H2>Bare — the om is in control</H2>
    <P>
      A {BareRun} inherits the terminal and opens no channel. The om owns stdout and stdin directly
      — its own live view, its native prompts, its own end-of-run summary — exactly as if you ran
      the file yourself. Nothing is intercepted; {RunBareExport} just resolves the child's exit
      code. This is what a direct run from the terminal uses, so it feels native rather than
      proxied.
    </P>

    <H2>The switch</H2>
    <P>
      The one bit that flips a child between the two is the <code>OMKIT_SUPERVISED</code>{" "}
      environment variable. {InteractionModule} reads it once at startup: set, the child speaks over
      the channel; unset, the child runs bare. A bare run clears the flag before forking, so a
      nested subprocess it spawns never inherits supervised mode by accident.
    </P>

    <H2>In code</H2>
    <P>A frontend starts a supervised run, prints its logs, and waits for the verdict.</P>
    <Snippet
      code={async () => {
        const client = createOmkitClient({ tsconfig: "om/tsconfig.omkit.json" });
        const session = client.run("om/oms/dev.om.ts");

        // Logs arrive over the channel instead of being printed by the child.
        session.on("log", (entry) => console.log(entry.message));

        // The verdict comes last, after the child has shut down what it started.
        const verdict = await session.result;
        return verdict.ok;
      }}
    />

    <Flow
      name="omkit-supervised-run"
      desc="A frontend runs an om as a supervised child and renders what it sends back"
    >
      <Step node={ClientExport} label="run() starts a supervised run" />
      <Step node={RunnerModule} label="forks the om file as a child, in supervised mode" />
      <Step node={ExecutionTreeModule} label="runs the om in the child" />
      <Step node={SupervisorExport} label="sends logs, prompts, and the verdict up the channel" />
      <Step node={ChannelModule} label="turns those messages into session events" />
      <Step node={RunSessionExport} label="the frontend listens to it and awaits the verdict" />
    </Flow>

    <Relation from={ClientExport} to={SupervisedRun} label="run() produces" />
    <Relation from={ClientExport} to={BareRun} label="runBare() produces" />
    <Relation
      from={RunnerModule}
      to={InteractionModule}
      label="flips supervised mode via OMKIT_SUPERVISED"
    />
    <Relation from={UiFolder} to={SupervisedRun} label="drives" />
  </Doc>
);
