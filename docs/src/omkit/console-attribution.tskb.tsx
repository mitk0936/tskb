import { type Module, type Export, Doc, H1, H2, P, List, Li, Relation, Snippet, ref } from "tskb";
import { action } from "packages/omkit/src/index.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.output.console-capture": Module<{
        desc: "Folds every console.* call made during a run into the log, attributed to the action it was called in.";
        type: typeof import("packages/omkit/src/output/console/ConsoleCapture.js");
      }>;
      "omkit.foundation.until-aborted": Module<{
        desc: "The untilAborted helper: a promise that resolves when an abort signal fires.";
        type: typeof import("packages/omkit/src/foundation/untilAborted.js");
      }>;
    }

    interface Exports {
      "omkit.untilAborted": Export<{
        desc: "Resolves when a signal aborts; code after the await keeps the waiting action's log attribution. Also on both contexts as ctx.untilAborted().";
        type: typeof import("packages/omkit/src/foundation/untilAborted.js").untilAborted;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ConsoleCaptureModule = ref as tskb.Modules["omkit.output.console-capture"];
const UntilAbortedExport = ref as tskb.Exports["omkit.untilAborted"];
const ActionContextExport = ref as tskb.Exports["omkit.ActionContext"];
const OmContextExport = ref as tskb.Exports["omkit.OmContext"];
const TailLogExport = ref as tskb.Exports["omkit.tailLog"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="Why can a console line from an action end up in another node's log?"
    priority="constraint"
  >
    <H1>Console attribution follows the async context</H1>
    <P>
      {ConsoleCaptureModule} does not know which action called <code>console.log</code>. It asks the
      current async context. That is right for code running in an action's body, its awaits, and
      timers it started. It is wrong for an <code>"abort"</code> listener: the signal fires inside
      whoever called <code>cancel()</code>, so the listener runs in their context, and its output
      lands in their log (often <code>main</code>). A daemon that flushes or says goodbye from an
      abort listener writes into someone else's log.
    </P>

    <Relation
      from={UntilAbortedExport}
      to={ConsoleCaptureModule}
      label="keeps attribution correct for"
    />
    <Relation
      from={ActionContextExport}
      to={UntilAbortedExport}
      label="exposes as ctx.untilAborted()"
    />
    <Relation
      from={OmContextExport}
      to={UntilAbortedExport}
      label="exposes as ctx.untilAborted()"
    />

    <H2>The rules</H2>
    <List>
      <Li>
        <strong>Wait for teardown with {UntilAbortedExport}, not a listener.</strong> Code after{" "}
        <code>await ctx.untilAborted()</code> resumes in the action's own context, so its cleanup
        output stays in its own log.
      </Li>
      <Li>
        <strong>If a callback must log at abort time, bind it.</strong> Wrap it in{" "}
        <code>AsyncResource.bind</code> where it is created, as {TailLogExport} does for its final
        partial-line flush.
      </Li>
    </List>

    <H2>The daemon idiom</H2>
    <P>A daemon that stays up until teardown, then cleans up under its own name:</P>
    <Snippet
      code={() => {
        const server = action("server").run(async (ctx) => {
          console.log("listening");
          await ctx.untilAborted();
          console.log("closing"); // logged under "server", not under whoever cancelled
        });
        return server;
      }}
    />
  </Doc>
);
