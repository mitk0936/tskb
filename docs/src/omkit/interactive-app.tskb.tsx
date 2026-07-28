import { type Module, Doc, H1, P, Relation, ref } from "tskb";

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
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const AppModule = ref as tskb.Modules["omkit.cli.ui.app"];
const OmListModule = ref as tskb.Modules["omkit.cli.ui.om-list"];
const RunViewModule = ref as tskb.Modules["omkit.cli.ui.run-view"];
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
  </Doc>
);
