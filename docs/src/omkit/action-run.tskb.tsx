import { type Module, type Export, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

type ActionRunClass = typeof import("packages/omkit/src/core/ActionRun.js").ActionRun;

declare global {
  namespace tskb {
    interface Modules {
      "omkit.core.action-run": Module<{
        desc: "ActionRun — one node in the ExecutionTree: identity, lifecycle, the run handle, and the error boundary that settles it.";
        type: typeof import("packages/omkit/src/core/ActionRun.js");
      }>;
    }

    interface Exports {
      "omkit.ActionRun": Export<{
        desc: "The concrete node behind a launched action — the class that implements Activity.";
        type: ActionRunClass;
      }>;

      "omkit.ActionRun.commit": Export<{
        desc: "Runs the armed body once, one microtask after the launching call — the window that keeps pre-body config (withCache) chainable.";
        type: InstanceType<ActionRunClass>["commit"];
      }>;

      "omkit.ActionRun.run": Export<{
        desc: "Executes the body inside the error boundary and settles the node. Never rejects.";
        type: InstanceType<ActionRunClass>["run"];
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ActionRunModule = ref as tskb.Modules["omkit.core.action-run"];
const ActionRunExport = ref as tskb.Exports["omkit.ActionRun"];
const CommitExport = ref as tskb.Exports["omkit.ActionRun.commit"];
const RunExport = ref as tskb.Exports["omkit.ActionRun.run"];

const ActivityExport = ref as tskb.Exports["omkit.Activity"];
const OutcomeExport = ref as tskb.Exports["omkit.Outcome"];
const ExecutionTreeModule = ref as tskb.Modules["omkit.core.execution-tree"];
const SupervisionTerm = ref as tskb.Terms["structured-supervision"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does an ActionRun run a launched action and settle it?">
    <H1>ActionRun</H1>
    <P>
      {ActionRunExport} in {ActionRunModule} is one node in the ExecutionTree — the concrete{" "}
      {ActivityExport} you get back from launching an action. It owns the node's identity and tags,
      its lifecycle status (running → ok, failed, or cancelled), its timing, and the run handle (
      <code>result</code>, <code>ref</code>, <code>on</code>, <code>once</code>, <code>tag</code>,{" "}
      <code>cancel</code>).
    </P>

    <Relation from={ActionRunExport} to={ActivityExport} label="implements" />

    <H2>The body runs a microtask late</H2>
    <P>
      Launching an action does not run its body right away. {CommitExport} runs the armed body one
      microtask after the launching call, and {RunExport} executes it inside the error boundary.
      That one-microtask gap is deliberate: it is the window in which pre-body config like{" "}
      <code>withCache</code> can still wrap the body. Chain <code>withCache</code> after the body
      has started and it throws — the window has closed.
    </P>

    <H2>Settling, without throwing</H2>
    <P>
      {RunExport} wraps the body in a try/catch: a normal return settles the node ok, a throw
      settles it failed. It never rejects — a failure is delivered through <code>result</code> as an{" "}
      {OutcomeExport}, and only surfaces as a thrown error at an <code>await</code> if you asked for
      that with <code>once("done")</code>. Settling also classifies the ending: if the node's signal
      was already aborted (a teardown in progress), it settles <em>cancelled</em> with a{" "}
      <code>CancelledError</code> rather than failed, so an intentional stop is never recorded as a
      fault.
    </P>

    <H2>Did anyone watch it fail?</H2>
    <P>
      This node is where {SupervisionTerm} is enforced. When it fails, it flips no global switch;
      instead, one microtask later, it asks whether anyone was watching. Reading <code>result</code>{" "}
      or <code>ref</code>, adding an <code>on("error")</code> listener, awaiting{" "}
      <code>once("done")</code>, or attaching <code>handleFailure</code> each mark the node
      observed. If nothing did — and the failure was this node's own, not an ancestor tearing its
      subtree down — the node reports the fault upward and the whole run tears down.
    </P>
    <P>
      The one-microtask delay before that check is what makes it usable: a same-tick{" "}
      <code>await task().result</code> or a chained <code>.handleFailure(…)</code> marks the node
      observed before the check runs, so ordinary code never trips the guard. One wrinkle the
      overview glosses: reading <code>ref</code> counts as watching only if the handle never
      attached — once an action has published its capability, a later failure is a separate event.
    </P>

    <Relation
      from={ActionRunExport}
      to={ExecutionTreeModule}
      label="reports unobserved failures to"
    />
  </Doc>
);
