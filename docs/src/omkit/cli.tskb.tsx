import { type Folder, type Module, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Folders {
      "omkit.cli": Folder<{
        desc: "The omkit command-line binary: the supervisor process that hosts the client engine and drives it — the commands (init, ls, check, run) and the interactive app.";
        path: "packages/omkit/src/cli";
        boundary: "omkit CLI";
      }>;

      "omkit.cli.commands": Folder<{
        desc: "The CLI command adapters — init, ls, check, and run — thin frontends over the client engine; run with no om opens the interactive app.";
        path: "packages/omkit/src/cli/commands";
      }>;

      "omkit.cli.ui": Folder<{
        desc: "The interactive Ink app: search oms, run one, stream live milestones, and answer prompts in-console.";
        path: "packages/omkit/src/cli/ui";
      }>;
    }

    interface Modules {
      "omkit.cli.ui.app": Module<{
        desc: "The interactive app's state machine: discover → list → run → live view.";
        type: typeof import("packages/omkit/src/cli/ui/app.js");
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const OmkitFolder = ref as tskb.Folders["omkit"];
const CliFolder = ref as tskb.Folders["omkit.cli"];
const ClientFolder = ref as tskb.Folders["omkit.client"];
const UiFolder = ref as tskb.Folders["omkit.cli.ui"];

const RunnerModule = ref as tskb.Modules["omkit.client.runner"];
const ExecutionTreeModule = ref as tskb.Modules["omkit.core.execution-tree"];

const CreateClient = ref as tskb.Exports["omkit.createOmkitClient"];
const RunSessionExport = ref as tskb.Exports["omkit.RunSession"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="What runs in the omkit CLI process versus an om run, and where is that boundary?"
    priority="supplementary"
  >
    <H1>The omkit CLI boundary</H1>
    <P>
      {CliFolder} is a distinct runtime from the {OmkitFolder} runtime. The CLI is the{" "}
      <em>supervisor</em> process: it discovers oms and spawns each run as its own child process,
      where the om body and the {ExecutionTreeModule} engine actually execute. The supervisor and
      the child talk over an inter-process channel, not shared memory — so the om's process-wide
      singleton, teardown, and keep-alive behaviour stay isolated in the child.
    </P>

    <H2>Frontends over the engine</H2>
    <P>
      The CLI does not own the discovery-and-supervision machinery — {ClientFolder} does, as a layer
      of its own. {CreateClient} is that headless engine; the command adapters and the {UiFolder}{" "}
      app are thin frontends that drive it. This file is about the process boundary; the engine
      itself is the subject of the client doc.
    </P>

    <Relation from={CliFolder} to={OmkitFolder} label="forks and supervises" />
    <Relation from={RunnerModule} to={ExecutionTreeModule} label="spawns as a child process" />
    <Relation from={UiFolder} to={RunSessionExport} label="renders live from" />
  </Doc>
);
