import { type Export, Doc, H1, H2, P, List, Li, Relation, Snippet, Flow, Step, ref } from "tskb";
import { setTimeout } from "node:timers/promises";
import { action, launchedFrom } from "packages/omkit/src/core/action.js";
import { callerSite } from "packages/omkit/src/foundation/callsite.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Exports {
      "omkit.launchedFrom": Export<{
        desc: "Internal: launches an action with a call site handed in, for batteries built per call.";
        type: typeof import("packages/omkit/src/core/action.js").launchedFrom;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const Command = ref as tskb.Exports["omkit.command"];
const PollUntil = ref as tskb.Exports["omkit.pollUntil"];
const LaunchedFrom = ref as tskb.Exports["omkit.launchedFrom"];
const CallerSite = ref as tskb.Exports["omkit.callerSite"];
const ActionModule = ref as tskb.Modules["omkit.core.action"];
const ReportWriterModule = ref as tskb.Modules["omkit.output.writers.report"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="What must a battery that builds its action per call do?" priority="constraint">
    <H1>Batteries built per call</H1>
    <P>
      {Command} and {PollUntil} create a new action each time they are called. That action is
      launched from inside omkit's own file, so omkit would record that file as the call site. The
      report would then lose the user's line and the <code>x = pollUntil(…)</code> label.
    </P>
    <P>A battery like this must:</P>
    <List>
      <Li>Capture its caller with {CallerSite} at the start of the function.</Li>
      <Li>Launch through {LaunchedFrom}, so that call site is used.</Li>
      <Li>Pass the call's own arguments to the launch, so the report's Args tab shows them.</Li>
      <Li>
        Leave secrets out of those arguments. {Command} drops <code>env</code>, because the run
        record is written to disk.
      </Li>
    </List>

    <H2>In code</H2>
    <P>A small battery that follows all four rules, in the same shape as {PollUntil}:</P>
    <Snippet
      code={() => {
        function wait(ms: number) {
          // 1. Capture the user's line first, before anything else runs.
          const site = callerSite();
          // 2. Launch through launchedFrom, so that line becomes the call site.
          return launchedFrom(
            site,
            () =>
              action(`wait ${ms}ms`).run(async ({ signal }, ..._shown: unknown[]) => {
                await setTimeout(ms, undefined, { signal });
              })(ms) // 3. Pass the call's arguments, so the report can show them. No secrets.
          );
        }
        return wait;
      }}
    />

    <Flow
      name="omkit-battery-call-site"
      desc="A battery built per call keeps the user's line as its call site, so the report labels the row with it"
    >
      <Step node={PollUntil} label="is called from the user's om" />
      <Step node={CallerSite} label="returns the user's file and line" />
      <Step node={LaunchedFrom} label="hands that site to the next launch" />
      <Step node={ActionModule} label="records it as the new node's call site" />
      <Step node={ReportWriterModule} label="labels the node's row with the user's line" />
    </Flow>

    <Relation from={Command} to={LaunchedFrom} label="launches through" />
    <Relation from={PollUntil} to={LaunchedFrom} label="launches through" />
    <Relation
      from={ReportWriterModule}
      to={CallerSite}
      label="labels rows from sites captured by"
    />
  </Doc>
);
