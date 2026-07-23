import { type Folder, type Module, type Export, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Folders {
      "omkit.cli": Folder<{
        desc: "The omkit command-line binary: the supervisor process that discovers oms, spawns each run as its own child process, and drives them (run, list, typecheck, and the interactive app).";
        path: "packages/omkit/src/cli";
        boundary: "omkit CLI";
      }>;

      "omkit.cli.client": Folder<{
        desc: "The headless client SDK: discovery, run supervision, and the supervisor side of the interaction channel — the UI-free engine every frontend drives.";
        path: "packages/omkit/src/cli/client";
      }>;

      "omkit.cli.commands": Folder<{
        desc: "The CLI command adapters — init, ls, check, and run — thin frontends over the client SDK; run with no om opens the interactive app.";
        path: "packages/omkit/src/cli/commands";
      }>;

      "omkit.cli.ui": Folder<{
        desc: "The interactive Ink app: search oms, run one, stream live milestones, and answer prompts in-console.";
        path: "packages/omkit/src/cli/ui";
      }>;
    }

    interface Modules {
      "omkit.cli.client.index": Module<{
        desc: "createOmkitClient — composes discovery, run supervision, and typecheck over one project config.";
        type: typeof import("packages/omkit/src/cli/client/index.js");
      }>;

      "omkit.cli.client.discovery": Module<{
        desc: "Static scan that finds runnable oms and inspectable actions from a project's tsconfig; degrades to warnings on type errors.";
        type: typeof import("packages/omkit/src/cli/client/discovery.js");
      }>;

      "omkit.cli.client.runner": Module<{
        desc: "Forks an om file as a supervised child and wraps its channel as a run session.";
        type: typeof import("packages/omkit/src/cli/client/runner.js");
      }>;

      "omkit.cli.client.channel": Module<{
        desc: "Supervisor side of the interaction protocol: turns a child's messages into a run session of live logs, prompts, and a verdict.";
        type: typeof import("packages/omkit/src/cli/client/channel.js");
      }>;

      "omkit.cli.ui.app": Module<{
        desc: "The interactive app's state machine: discover → list → run → live view.";
        type: typeof import("packages/omkit/src/cli/ui/app.js");
      }>;
    }

    interface Exports {
      "omkit.createOmkitClient": Export<{
        desc: "Builds the headless engine (discover / run / check) over a project's tsconfig — the seam the CLI, the interactive app, and a future MCP server share.";
        type: typeof import("packages/omkit/src/cli/client/index.js").createOmkitClient;
      }>;

      "omkit.OmkitClient": Export<{
        desc: "The client surface: discover the project, run an om as a supervised child, and typecheck.";
        type: import("packages/omkit/src/cli/client/index.js").OmkitClient;
      }>;

      "omkit.RunSession": Export<{
        desc: "A live handle to one supervised run: subscribe to logs and prompts, answer, cancel, and await the verdict.";
        type: import("packages/omkit/src/cli/client/index.js").RunSession;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const OmkitFolder = ref as tskb.Folders["omkit"];
const CliFolder = ref as tskb.Folders["omkit.cli"];
const ClientFolder = ref as tskb.Folders["omkit.cli.client"];
const UiFolder = ref as tskb.Folders["omkit.cli.ui"];

const RunnerModule = ref as tskb.Modules["omkit.cli.client.runner"];
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

    <H2>The client SDK</H2>
    <P>
      {ClientFolder} is the headless core of that boundary. {CreateClient} exposes discover / run /
      check, and a launched run is a {RunSessionExport} the caller subscribes to for live logs and
      prompts. It contains no terminal or UI code, so the CLI commands, the interactive app, and a
      future MCP server are all thin frontends over the same engine.
    </P>

    <Relation from={CliFolder} to={OmkitFolder} label="forks and supervises" />
    <Relation from={RunnerModule} to={ExecutionTreeModule} label="spawns as a child process" />
    <Relation from={UiFolder} to={RunSessionExport} label="renders live from" />
  </Doc>
);
