import { Doc, H1, P, List, Li, Relation, ref } from "tskb";

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ScrollbackModule = ref as tskb.Modules["omkit.cli.ui.scrollback"];
const ShellLinesModule = ref as tskb.Modules["omkit.cli.ui.shell-lines"];
const RunViewModule = ref as tskb.Modules["omkit.cli.ui.run-view"];
const RunModelModule = ref as tskb.Modules["omkit.output.run-model"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="Why does the interactive app split the screen into scrollback and a live box?"
    priority="supplementary"
  >
    <H1>Scrollback and the live box</H1>
    <P>The screen has two parts:</P>
    <List>
      <Li>
        {ScrollbackModule}, at the top. It is written once and never redrawn. It holds results only:
        each run's header, nodes that finished and how long they took, failures, errors, failed
        asserts, and the verdict with the paths to <code>main.log</code> and the report.{" "}
        {ShellLinesModule} decides which log entries go here.
      </Li>
      <Li>
        {RunViewModule}, at the bottom. It is the only part that is redrawn. It shows the running
        nodes with their latest line, the finished count, a prompt, and the keys.
      </Li>
    </List>
    <P>
      The reason is speed. A redraw costs time in proportion to what it draws, so keeping the live
      part small lets the app keep up with a run that prints a lot. Nothing is lost: output, events,
      and launches are left out of the scrollback, but they are all in the run's logs and report.
    </P>
    <P>Both parts read from one {RunModelModule} per run.</P>

    <Relation from={ShellLinesModule} to={ScrollbackModule} label="picks the lines for" />
    <Relation from={ShellLinesModule} to={RunModelModule} label="reads node status from" />
    <Relation from={RunViewModule} to={RunModelModule} label="draws running nodes from" />
  </Doc>
);
