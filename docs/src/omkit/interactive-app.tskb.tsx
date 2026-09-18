import { type Module, type Export, Doc, H1, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.cli.ui.om-list": Module<{
        desc: "The picker screen: a searchable list of discovered oms; selecting one starts a run.";
        type: typeof import("packages/omkit/src/cli/ui/views/OmList.js");
      }>;
      "omkit.cli.ui.run-view": Module<{
        desc: "The run screen: streams milestone lines, shows an inline prompt when the run asks, and renders the final verdict.";
        type: typeof import("packages/omkit/src/cli/ui/views/RunView.js");
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
const ByNesting = ref as tskb.Exports["omkit.byNesting"];
const SkillModelModule = ref as tskb.Modules["omkit.skill.model"];
const LsCommand = ref as tskb.Modules["omkit.cli.commands.ls"];
const ClientExport = ref as tskb.Exports["omkit.OmkitClient"];
const RunSessionExport = ref as tskb.Exports["omkit.RunSession"];
const SupervisedRun = ref as tskb.Terms["supervised-run"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does the interactive app work?" priority="supplementary">
    <H1>The interactive app</H1>
    <P>
      {AppModule} is a small state machine over one {ClientExport}, with three screens: pick, run,
      done. It opens on {OmListModule} — a searchable list of the discovered oms. Selecting one
      starts a {SupervisedRun} through the client and switches to {RunViewModule}.
    </P>
    <P>
      The list is not in discovery order. {OmListModule} sorts it with {ByNesting}, measured from
      the working directory — the same root its path column is rendered from — so the oms nearest
      the top of the project come first and the deeply nested ones sink. Where an om sits says what
      it is for: the everyday, core workflows live near the root, the specialised variants and
      helpers behind them further down. Oms at one depth are alphabetical. {LsCommand} and{" "}
      {SkillModelModule} apply the same comparator, so the terminal listing, the picker, and the
      generated skill all present a project in one order.
    </P>
    <P>
      From there the app just reflects the {RunSessionExport} it subscribed to: log messages become
      milestone lines, a prompt renders an inline box whose answer goes back down the channel, and{" "}
      <em>settled</em> shows the verdict. Ctrl+C requests a graceful cancel and waits for the child
      to tear down and report, rather than force-quitting — so the servers, watchers, and browsers a
      run started are never orphaned.
    </P>

    <Relation from={AppModule} to={ClientExport} label="drives" />
    <Relation from={AppModule} to={RunSessionExport} label="renders live from" />
    <Relation from={AppModule} to={OmListModule} label="opens on" />
    <Relation from={AppModule} to={RunViewModule} label="switches to on run" />
    <Relation from={OmListModule} to={ByNesting} label="orders its rows with" />
  </Doc>
);
