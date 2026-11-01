import {
  type Module,
  type Export,
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
    interface Modules {
      "omkit.cli.ui.om-list": Module<{
        desc: "The picker: a searchable list of discovered oms, with details of the highlighted one.";
        type: typeof import("packages/omkit/src/cli/ui/views/OmList.js");
      }>;
      "omkit.cli.ui.run-view": Module<{
        desc: "The live run box: phase and elapsed time, the running nodes with their latest line, the finished tally, and an inline prompt when the run asks.";
        type: typeof import("packages/omkit/src/cli/ui/views/RunView.js");
      }>;
      "omkit.cli.ui.scrollback": Module<{
        desc: "The session's record of outcomes: run headers, finished nodes, failures, and verdicts. Written once, never redrawn.";
        type: typeof import("packages/omkit/src/cli/ui/views/Scrollback.js");
      }>;
      "omkit.cli.ui.shell-lines": Module<{
        desc: "Decides which log entries become scrollback lines, and cuts the verdict recap down to what you need next.";
        type: typeof import("packages/omkit/src/cli/ui/views/shellLines.js");
      }>;
      "omkit.cli.ui.open-file": Module<{
        desc: "Opens a file with the system's default app, such as the run report in a browser.";
        type: typeof import("packages/omkit/src/cli/ui/openFile.js");
      }>;
      "omkit.client.order": Module<{
        desc: "The order a project's oms are listed in, shared by the picker and the generated skill: nearest the root first, then by name.";
        type: typeof import("packages/omkit/src/client/order.js");
      }>;
    }

    interface Exports {
      "omkit.byNesting": Export<{
        desc: "Comparator over named, located entries: fewer directories below the root first, then alphabetical, then by file; anything outside the root last.";
        type: typeof import("packages/omkit/src/client/order.js").byNesting;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const AppModule = ref as tskb.Modules["omkit.cli.ui.app"];
const OmListModule = ref as tskb.Modules["omkit.cli.ui.om-list"];
const RunViewModule = ref as tskb.Modules["omkit.cli.ui.run-view"];
const ScrollbackModule = ref as tskb.Modules["omkit.cli.ui.scrollback"];
const OpenFileModule = ref as tskb.Modules["omkit.cli.ui.open-file"];
const RunModelModule = ref as tskb.Modules["omkit.output.run-model"];
const ByNesting = ref as tskb.Exports["omkit.byNesting"];
const OutlineModule = ref as tskb.Modules["omkit.client.outline"];
const SkillModelModule = ref as tskb.Modules["omkit.skill.model"];
const LsCommand = ref as tskb.Modules["omkit.cli.commands.ls"];
const ClientExport = ref as tskb.Exports["omkit.OmkitClient"];
const RunSessionExport = ref as tskb.Exports["omkit.RunSession"];
const SupervisedRun = ref as tskb.Terms["supervised-run"];
const DiscoveryModule = ref as tskb.Modules["omkit.client.discovery"];
const DetailsOf = ref as tskb.Exports["omkit.detailsOf"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the interactive app work?" priority="supplementary">
    <H1>The interactive app</H1>
    <P>
      {AppModule} is a shell that stays open across runs. You pick an om, watch it run, and come
      back to the picker when it ends. It runs one {SupervisedRun} at a time, through one{" "}
      {ClientExport}.
    </P>

    <H2>The picker</H2>
    <P>
      {OmListModule} sorts oms with {ByNesting}: oms near the project root first, then by name.{" "}
      {LsCommand} and {SkillModelModule} use the same order. Below the list it shows the highlighted
      om: its description, where it is defined, and its steps. {OutlineModule} reads all of this
      from the source without running it.
    </P>

    <Flow
      name="omkit-picker-list"
      desc="The interactive app builds its om list from the project's source, without running any om"
    >
      <Step node={AppModule} label="asks the client to discover the project" />
      <Step node={ClientExport} label="discover() scans the files in the project's tsconfig" />
      <Step node={DiscoveryModule} label="finds every om() call" />
      <Step node={OutlineModule} label="reads each om's summary and steps from the source" />
      <Step node={DetailsOf} label="reads its other describe props" />
      <Step node={ByNesting} label="orders the oms, root first" />
      <Step node={OmListModule} label="shows the list and the highlighted om's details" />
    </Flow>

    <H2>Rerun</H2>
    <P>
      Each run is a new child process that loads the om from source, so a rerun always runs the
      current code. No build is needed. Only the om list can go out of date, so the app runs
      discovery again in the background after each run. If that scan fails, it keeps the old list.
      It will not rerun an om the new scan no longer finds.
    </P>

    <H2>Keys</H2>
    <List>
      <Li>↑↓ and Enter: pick and run an om.</Li>
      <Li>Esc: stop the run and go back to the picker.</Li>
      <Li>Ctrl+C: stop the run and quit. In the picker, quit at once.</Li>
      <Li>Ctrl+R: run the last om again.</Li>
      <Li>Ctrl+O: open the last run's report, through {OpenFileModule}.</Li>
    </List>

    <Relation from={AppModule} to={ClientExport} label="drives" />
    <Relation from={AppModule} to={RunSessionExport} label="renders live from" />
    <Relation from={AppModule} to={OmListModule} label="opens on, and returns to after each run" />
    <Relation from={AppModule} to={RunViewModule} label="shows while a run is live" />
    <Relation from={AppModule} to={ScrollbackModule} label="writes each run's record to" />
    <Relation from={AppModule} to={RunModelModule} label="folds each run's log through" />
    <Relation from={AppModule} to={OpenFileModule} label="opens the report with" />
    <Relation from={OmListModule} to={ByNesting} label="orders its rows with" />
    <Relation from={OmListModule} to={OutlineModule} label="details the highlighted om from" />
  </Doc>
);
