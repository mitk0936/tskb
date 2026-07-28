import {
  type Folder,
  type Module,
  type Export,
  type Term,
  Doc,
  H1,
  H2,
  P,
  Relation,
  ref,
} from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Folders {
      "omkit.client": Folder<{
        desc: "The headless engine every omkit frontend drives: project discovery, run supervision, typecheck, and the supervisor side of the interaction channel — no terminal or UI code.";
        path: "packages/omkit/src/client";
      }>;
    }

    interface Modules {
      "omkit.client.index": Module<{
        desc: "createOmkitClient — the single engine handle over one project config: discover, run (supervised), runBare, and check.";
        type: typeof import("packages/omkit/src/client/index.js");
      }>;

      "omkit.client.discovery": Module<{
        desc: "Static scan that finds runnable oms and inspectable actions from a project's tsconfig; degrades to warnings on type errors.";
        type: typeof import("packages/omkit/src/client/discovery.js");
      }>;

      "omkit.client.runner": Module<{
        desc: "Forks an om as a child — supervised (piped stdio, over the channel) or bare (inherited stdio) — and wraps a supervised run as a session.";
        type: typeof import("packages/omkit/src/client/runner.js");
      }>;

      "omkit.client.channel": Module<{
        desc: "Supervisor side of the interaction protocol: turns a child's messages into a run session of live logs, prompts, and a verdict.";
        type: typeof import("packages/omkit/src/client/channel.js");
      }>;
    }

    interface Exports {
      "omkit.createOmkitClient": Export<{
        desc: "Builds the headless engine over a project's tsconfig — the one seam the CLI, the interactive app, and a future MCP server share.";
        type: typeof import("packages/omkit/src/client/index.js").createOmkitClient;
      }>;

      "omkit.OmkitClient": Export<{
        desc: "The engine surface: the project's tsconfig, discover, run (supervised) / runBare (unsupervised), and typecheck.";
        type: import("packages/omkit/src/client/index.js").OmkitClient;
      }>;

      "omkit.RunSession": Export<{
        desc: "A live handle to one supervised run: subscribe to logs and prompts, answer, cancel, and await the verdict.";
        type: import("packages/omkit/src/client/index.js").RunSession;
      }>;
    }

    interface Terms {
      "supervised-run": Term<"A run forked as a child with piped stdio and an IPC channel, so a frontend observes its logs and prompts over the channel and renders them itself.">;
      "bare-run": Term<"A run forked with inherited stdio and no channel, so the om owns the terminal — native prompts and its own live view — and reports back only an exit code.">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ClientFolder = ref as tskb.Folders["omkit.client"];
const CliFolder = ref as tskb.Folders["omkit.cli"];
const UiFolder = ref as tskb.Folders["omkit.cli.ui"];
const CoreFolder = ref as tskb.Folders["omkit.core"];

const InteractionModule = ref as tskb.Modules["omkit.core.interaction"];

const CreateClient = ref as tskb.Exports["omkit.createOmkitClient"];
const ClientExport = ref as tskb.Exports["omkit.OmkitClient"];
const RunSessionExport = ref as tskb.Exports["omkit.RunSession"];

const SupervisedRun = ref as tskb.Terms["supervised-run"];
const BareRun = ref as tskb.Terms["bare-run"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="Why does every omkit frontend go through the client?" priority="essential">
    <H1>The client — omkit's headless engine</H1>
    <P>
      {ClientFolder} is a layer of its own, a peer of {CoreFolder} rather than a part of any one
      frontend. It is the whole backend a frontend needs: {CreateClient} builds one {ClientExport}{" "}
      over a project's tsconfig, and every operation — discover the project, run an om, typecheck —
      is a method on that one handle. Nothing reaches around it: a direct terminal run and the
      interactive app both go through the same client, and the tsconfig lives on the client instead
      of being passed alongside it by each caller.
    </P>
    <P>
      The engine holds no terminal or UI code. That is what lets {CliFolder}'s commands, the{" "}
      {UiFolder} app, and a future MCP server all be thin frontends over the same backend — and it
      is why the layer sits beside {CoreFolder}, not inside {CliFolder}.
    </P>

    <H2>Two shapes of run</H2>
    <P>
      A run comes in two shapes. A {SupervisedRun} returns a {RunSessionExport} the caller
      subscribes to; a {BareRun} returns just an exit code and lets the om own the terminal. Which
      one, and why, is its own question — see the run-modes doc.
    </P>

    <Relation from={CliFolder} to={ClientFolder} label="runs on" />
    <Relation from={ClientFolder} to={CoreFolder} label="built on, never the reverse" />
    <Relation from={ClientFolder} to={InteractionModule} label="shares the wire protocol with" />
    <Relation from={UiFolder} to={RunSessionExport} label="renders live from" />
  </Doc>
);
