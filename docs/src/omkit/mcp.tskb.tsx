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
  List,
  Li,
  Relation,
  Flow,
  Step,
  ref,
} from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Folders {
      "omkit.mcp": Folder<{
        desc: "The Model Context Protocol frontend: a stdio server that lets an assistant list a project's opted-in oms and actions, run one, and read what the run produced.";
        path: "packages/omkit/src/mcp";
      }>;
    }

    interface Modules {
      "omkit.mcp.server": Module<{
        desc: "Assembles the McpServer — registers the tools and resources, owns the run registry, and binds stdio.";
        type: typeof import("packages/omkit/src/mcp/server.js");
      }>;

      "omkit.mcp.tools": Module<{
        desc: "The six tools: list_oms, run_om, start_om, get_run, tail_run, cancel_run — plus the registry cache and the settling backstop.";
        type: typeof import("packages/omkit/src/mcp/tools.js");
      }>;

      "omkit.mcp.resources": Module<{
        desc: "Run folders as MCP resources: the two URI templates, path confinement under logs/, size caps, and MIME by extension.";
        type: typeof import("packages/omkit/src/mcp/resources.js");
      }>;

      "omkit.mcp.runs": Module<{
        desc: "The registry of runs this server started — their live log buffer, their verdict once settled, and teardown when the client disconnects.";
        type: typeof import("packages/omkit/src/mcp/runs.js");
      }>;

      "omkit.mcp.progress": Module<{
        desc: "The three live channels during a call: milestones to progress notifications, request cancellation to teardown, and a run's prompts to elicitation.";
        type: typeof import("packages/omkit/src/mcp/progress.js");
      }>;

      "omkit.mcp.action-host": Module<{
        desc: "The shipped host om an action-backed tool is forked as, since an action cannot run outside a run.";
        type: typeof import("packages/omkit/src/mcp/action-host.js");
      }>;

      "omkit.mcp.action-identity": Module<{
        desc: "The naming rule a hosted action runs under, shared by the host and the server so the folder one creates is the folder the other predicts.";
        type: typeof import("packages/omkit/src/mcp/action-identity.js");
      }>;

      "omkit.mcp.validate": Module<{
        desc: "A shallow check of a call's arguments against the declared JSON Schema — required keys and top-level types, so an obviously wrong call fails before a fork.";
        type: typeof import("packages/omkit/src/mcp/validate.js");
      }>;

      "omkit.mcp.verdict": Module<{
        desc: "Turns a settled run into a structured verdict, reading the assert tally and per-action failures back out of the run's own result.json.";
        type: typeof import("packages/omkit/src/mcp/verdict.js");
      }>;

      "omkit.mcp.tail": Module<{
        desc: "Cursor-paged log reads: from a live run's bounded buffer while it runs, and from raw.jsonl once it has settled.";
        type: typeof import("packages/omkit/src/mcp/tail.js");
      }>;

      "omkit.core.discovery-mode": Module<{
        desc: "The OMKIT_DISCOVER fork mode: makes an om report what it declares instead of launching, and carries the registration over IPC.";
        type: typeof import("packages/omkit/src/core/discovery-mode.js");
      }>;

      "omkit.client.discover-child": Module<{
        desc: "The throwaway child that imports candidate files in discovery mode and reports the actions it finds on their exports.";
        type: typeof import("packages/omkit/src/client/discover-child.js");
      }>;
    }

    interface Exports {
      "omkit.mcp.createMcpServer": Export<{
        desc: "Builds the server over a client and a project root, without binding a transport — the seam tests connect in-process.";
        type: typeof import("packages/omkit/src/mcp/server.js").createMcpServer;
      }>;

      "omkit.mcp.startMcpServer": Export<{
        desc: "Builds the server and binds it to stdio, serving until the client disconnects.";
        type: typeof import("packages/omkit/src/mcp/server.js").startMcpServer;
      }>;

      "omkit.discoverRegistrations": Export<{
        desc: "Reads what a project's oms and actions declare by importing them in a throwaway child — real schemas, at the cost of executing user code.";
        type: typeof import("packages/omkit/src/client/index.js").discoverRegistrations;
      }>;

      "omkit.readRegistrations": Export<{
        desc: "The fork half of registration discovery, over an explicit file list — for callers that already know their candidates.";
        type: typeof import("packages/omkit/src/client/index.js").readRegistrations;
      }>;

      "omkit.RegistrationSet": Export<{
        desc: "What a discovery fork yields: the oms and actions with their summaries, exposure, and argument schemas, plus soft warnings.";
        type: import("packages/omkit/src/client/index.js").RegistrationSet;
      }>;
    }

    interface Externals {
      "modelcontextprotocol-sdk": External<{
        desc: "The official Model Context Protocol SDK. Provides the server, the stdio transport, and the request plumbing. Imported only under the mcp folder.";
        url: "https://github.com/modelcontextprotocol/typescript-sdk";
        kind: "npm-package";
      }>;
    }

    interface Terms {
      "mcp-exposure": Term<"The .mcp() marker on an om or action builder. Absent, the MCP server neither lists nor runs it — .describe() and .args() alone expose nothing, so a project opts in per entry rather than publishing everything it happens to define.">;
      "discovery-fork": Term<"A throwaway child process that imports a project's om files purely to read what they declare. Needed because importing an om file runs it, so metadata that only exists after evaluation cannot be read in-process.">;
      "settling-run": Term<"A run declared to finish on its own, which run_om waits out and returns a verdict for. Its opposite, a long-lived run (a server, a watcher), must be started with start_om and reached afterwards by handle.">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const McpFolder = ref as tskb.Folders["omkit.mcp"];
const ClientFolder = ref as tskb.Folders["omkit.client"];
const CoreFolder = ref as tskb.Folders["omkit.core"];
const CliFolder = ref as tskb.Folders["omkit.cli"];

const ServerModule = ref as tskb.Modules["omkit.mcp.server"];
const ToolsModule = ref as tskb.Modules["omkit.mcp.tools"];
const ResourcesModule = ref as tskb.Modules["omkit.mcp.resources"];
const RunsModule = ref as tskb.Modules["omkit.mcp.runs"];
const ProgressModule = ref as tskb.Modules["omkit.mcp.progress"];
const ActionHostModule = ref as tskb.Modules["omkit.mcp.action-host"];
const ActionIdentityModule = ref as tskb.Modules["omkit.mcp.action-identity"];
const ValidateModule = ref as tskb.Modules["omkit.mcp.validate"];
const VerdictModule = ref as tskb.Modules["omkit.mcp.verdict"];
const TailModule = ref as tskb.Modules["omkit.mcp.tail"];
const DiscoveryModeModule = ref as tskb.Modules["omkit.core.discovery-mode"];
const DiscoverChildModule = ref as tskb.Modules["omkit.client.discover-child"];
const DiscoveryModule = ref as tskb.Modules["omkit.client.discovery"];
const RunFolderModule = ref as tskb.Modules["omkit.output.run-folder"];

const CreateMcpServer = ref as tskb.Exports["omkit.mcp.createMcpServer"];
const StartMcpServer = ref as tskb.Exports["omkit.mcp.startMcpServer"];
const DiscoverRegistrations = ref as tskb.Exports["omkit.discoverRegistrations"];
const RegistrationSetExport = ref as tskb.Exports["omkit.RegistrationSet"];
const CreateClient = ref as tskb.Exports["omkit.createOmkitClient"];
const OmExport = ref as tskb.Exports["omkit.om"];
const ActionExport = ref as tskb.Exports["omkit.action"];

const McpSdk = ref as tskb.Externals["modelcontextprotocol-sdk"];

const ExposureTerm = ref as tskb.Terms["mcp-exposure"];
const DiscoveryForkTerm = ref as tskb.Terms["discovery-fork"];
const SettlingTerm = ref as tskb.Terms["settling-run"];
const RunFolderTerm = ref as tskb.Terms["run-folder"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="What does omkit expose over MCP, and how does a client drive it?"
    priority="essential"
  >
    <H1>The MCP server — omkit as a tool an assistant can drive</H1>
    <P>
      {McpFolder} is omkit's third frontend, beside the terminal commands and the interactive app,
      and like them it is thin: it holds no execution model of its own and reaches the runtime only
      through {CreateClient}. What it adds is a protocol surface, so an assistant can discover the
      runnable oms in a project, run one, get a verdict, and read the artifacts the run produced —
      instead of shelling out and scraping stdout.
    </P>
    <P>
      {McpSdk} is imported only under {McpFolder}. Nothing in {CoreFolder} or {ClientFolder} learns
      that MCP exists, so an om file never imports it and the runtime is unchanged for a project
      that never turns the server on.
    </P>
    <P>
      {StartMcpServer} is what the terminal command runs: it assembles the server and binds it to
      stdio, which is also why nothing on that path may print — stdout <em>is</em> the protocol
      stream, and a stray line reaches the client as a parse error it cannot explain.{" "}
      {CreateMcpServer} stops one step short, returning the assembled server without a transport, so
      a caller can attach one of its own.
    </P>

    <H2>Exposure is opt-in</H2>
    <P>
      An om or action is visible to the server only if it carries an {ExposureTerm}. This is the
      whole access model: a project decides entry by entry what an assistant may run, and defining
      an om does not publish it. The marker also carries the entry's mode, which matters because a
      tool definition cannot express duration — MCP has no field for "this one never finishes" — so
      omkit says it instead. A {SettlingTerm} is what the blocking tool accepts; anything long-lived
      is refused there and must be started by handle.
    </P>

    <H2>Why discovery needs a child process</H2>
    <P>
      {DiscoveryModule} scans a project statically and never imports anything, which is what keeps
      the terminal's listing instant. But a summary and an argument schema only exist once a module
      has been evaluated, and evaluating an om file <em>runs</em> it — {OmExport} launches at module
      load, by design. So reading that metadata takes a {DiscoveryForkTerm}: {DiscoverRegistrations}{" "}
      imports the candidate files in a throwaway child where {DiscoveryModeModule} has turned{" "}
      <code>.run</code> into a registration, and the child exits before anything it started can
      matter. The result is a {RegistrationSetExport}.
    </P>
    <P>
      Two properties of that fork are load-bearing. The guard sits at the single point both{" "}
      <code>run</code> methods funnel through, ahead of both argument resolution and the run folder,
      so discovering an om with required arguments neither prompts nor litters the log directory.
      And registrations travel over the child's IPC channel rather than a shared variable, because a
      user's file resolves omkit through its own install while the child runs omkit's own module
      graph — two copies, each with its own module state. For the same reason an {ActionExport}{" "}
      converts its own schema and hands the result over, rather than letting {DiscoverChildModule}{" "}
      convert a schema built by a different copy.
    </P>
    <P>
      Failure stays soft throughout: a file that throws on import becomes a warning and every other
      entry still lists, and a schema that cannot be represented degrades that one entry to
      unavailable rather than emptying the list.
    </P>

    <H2>The tool surface</H2>
    <P>
      {ToolsModule} registers six tools, and the count does not change as a project grows — adding
      an om changes what the listing <em>returns</em>, never what tools exist. That is the trade the
      design makes: a client must ask what is available before it can call anything, and in exchange
      its tool list never churns because someone edited a file.
    </P>
    <List>
      <Li>List the exposed entries, with their summaries, modes, and argument schemas.</Li>
      <Li>Run one and wait for a verdict — accepted only for a {SettlingTerm}.</Li>
      <Li>Start one and get a handle back immediately, for anything long-lived or slow.</Li>
      <Li>Check on a run, page through its log from a cursor, or cancel it.</Li>
    </List>
    <P>
      {RunsModule} holds the runs the server started. Handles are server-assigned rather than run
      folders, because a run folder's dated path is stamped inside the child on first access — it
      does not exist yet at the moment a start has to answer. {TailModule} pages a run's log by
      cursor, from that live buffer while it runs and from the run's own record once it settles.
    </P>
    <P>
      Two smaller pieces guard the ends of a call. {ValidateModule} checks a call's arguments before
      anything is forked — required keys and top-level types only, because the real schema lives in
      the om's own process and resolution there is what actually validates. And {VerdictModule}{" "}
      reads the outcome back out of the run's record rather than parsing what scrolled past, so the
      assert tally and the failing actions are the run's own account of itself.
    </P>

    <H2>Talking back during a run</H2>
    <P>
      {ProgressModule} wires the three live channels. Milestone log lines become progress
      notifications, keyed on the run's own monotonic log sequence. A cancelled request tears the
      run down, and the run still writes its record on the way out. And a prompt raised mid-run
      reaches the client as an elicitation — the supervisor a run expects is whoever owns the
      terminal, which under MCP is the client itself. A client that declines, or cannot elicit at
      all, gets the prompt's default rather than leaving the run to wait.
    </P>

    <H2>Reading what a run produced</H2>
    <P>
      {ResourcesModule} publishes run folders as resources under two URI templates: the newest run
      of an entry, and one specific dated run. The first is the payoff of the {RunFolderTerm}'s
      stable identity — an assistant can ask for "the latest run of X" without having watched it
      happen.
    </P>
    <P>
      URIs are untrusted input, so every read is confined under the project's log directory, checked
      both lexically and through the resolved real path so neither a traversal nor a symlink
      escapes. Reads are size-capped, and the surface is read-only: there is no write path and no
      way to delete a run through the protocol. Results carry links rather than inlined content, so
      a client reads only the files it turns out to need.
    </P>

    <H2>Actions need a host</H2>
    <P>
      An {ActionExport} cannot run on its own — it requires an active run to attach to. So an
      action-backed tool forks {ActionHostModule}, a real om that omkit ships, which imports the
      action's module and launches it. Nothing about the run's identity is forged: the host file
      genuinely is where that run is defined, and the action's own identity rides in the run's{" "}
      <em>name</em>, so two same-named actions in different files still get separate folders.
    </P>
    <P>
      {ActionIdentityModule} owns that naming rule, and both sides of the fork use it — the host to
      name its run, the server to answer where the run will land before the child has created
      anything. One function, so the prediction and the reality cannot drift apart.
    </P>
    <P>
      One sharp edge is documented rather than prevented: an action that publishes a capability for
      downstream steps hands it to nobody when run alone, so such actions make poor tools.
    </P>

    <Relation from={McpFolder} to={ClientFolder} label="runs on" />
    <Relation from={CliFolder} to={ServerModule} label="starts over stdio" />
    <Relation from={ServerModule} to={ToolsModule} label="registers" />
    <Relation from={ServerModule} to={ResourcesModule} label="registers" />
    <Relation from={ToolsModule} to={RunsModule} label="tracks its runs in" />
    <Relation from={ToolsModule} to={ProgressModule} label="reports live through" />
    <Relation from={DiscoverRegistrations} to={DiscoverChildModule} label="forks" />
    <Relation from={DiscoveryModeModule} to={OmExport} label="turns .run into a registration for" />
    <Relation from={ResourcesModule} to={RunFolderModule} label="serves the folders written by" />
    <Relation from={McpFolder} to={McpSdk} label="speaks the protocol through" />

    <Flow
      name="mcp-run-om"
      desc="An assistant asks the server to run an om: metadata comes from a discovery fork, the run is supervised through the client, and its record is served back as resources"
      priority="essential"
    >
      <Step node={ServerModule} label="receives the tool call over stdio" />
      <Step node={ToolsModule} label="resolves the entry and checks the arguments" />
      <Step
        node={DiscoverRegistrations}
        label="supplies the declared metadata, cached per process"
      />
      <Step node={CreateClient} label="forks the om as a supervised run" />
      <Step node={ProgressModule} label="forwards milestones and prompts while it runs" />
      <Step node={RunFolderModule} label="writes the run's record to disk" />
      <Step node={ResourcesModule} label="serves that record back as resources" />
    </Flow>
  </Doc>
);
