import { type Export, Doc, H1, H2, P, Relation, ref } from "tskb";

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
