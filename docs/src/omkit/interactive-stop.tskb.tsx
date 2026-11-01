import { Doc, H1, P, Relation, Flow, Step, ref } from "tskb";

// ─── Refs ─────────────────────────────────────────────────────────────────────

const AppModule = ref as tskb.Modules["omkit.cli.ui.app"];
const RunSessionExport = ref as tskb.Exports["omkit.RunSession"];
const ChannelModule = ref as tskb.Modules["omkit.client.channel"];
const SupervisorExport = ref as tskb.Exports["omkit.core.Supervisor"];
const ExecutionTreeModule = ref as tskb.Modules["omkit.core.execution-tree"];
const SystemFolder = ref as tskb.Folders["omkit.system"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="Why must the interactive app wait for a run's verdict before it moves on or quits?"
    priority="constraint"
  >
    <H1>Stopping a run</H1>
    <P>
      A run can start servers, watchers, and browsers. If the app quit before the child process
      cleaned them up, they would keep running with no owner.
    </P>
    <P>
      So every stop in {AppModule} is a graceful cancel. The app asks the child to stop. The child
      shuts down what it started and reports a verdict. Only then does the app go back to the picker
      or quit. Pressing the key again does nothing. Do not add a force-quit path.
    </P>
    <P>
      An om that returns while its daemons are still running shows as <em>up</em> until you stop it.
      The process exit code is the last run's verdict.
    </P>

    <Flow
      name="omkit-interactive-stop"
      desc="The user presses Esc or Ctrl+C during a run; the child shuts down what it started and reports, and only then does the app move on"
    >
      <Step node={AppModule} label="the user presses Esc or Ctrl+C; the app calls cancel() once" />
      <Step node={ChannelModule} label="sends a cancel message to the child" />
      <Step node={SupervisorExport} label="receives it and asks the run to cancel" />
      <Step node={ExecutionTreeModule} label="tears down: cancels every node" />
      <Step node={SystemFolder} label="kills every process the run started" />
      <Step node={SupervisorExport} label="sends the verdict up the channel" />
      <Step node={RunSessionExport} label="resolves the verdict" />
      <Step node={AppModule} label="goes back to the picker, or quits" />
    </Flow>

    <Relation
      from={AppModule}
      to={RunSessionExport}
      label="cancels, then waits for the verdict of"
    />
  </Doc>
);
