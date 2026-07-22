import { type Module, type Export, Doc, H1, H2, P, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.actions.chrome-page": Module<{
        desc: "The chromePage battery: attaches to Chrome over CDP (or an existing Page/Browser/Context) and publishes the live Page as its capability.";
        type: typeof import("packages/omkit/src/actions/chrome-page.js");
      }>;
    }

    interface Exports {
      "omkit.ActionContext": Export<{
        desc: "What an action's body receives — signal, logs, emit, tag, assert, snapshot, proc, and attach (the capability publisher).";
        type: import("packages/omkit/src/core/types.js").ActionContext;
      }>;

      "omkit.chromePage": Export<{
        desc: "Attaches to a Chrome page and publishes it as a live Playwright Page handle for downstream actions to drive.";
        type: typeof import("packages/omkit/src/actions/chrome-page.js").chromePage;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ChromePageModule = ref as tskb.Modules["omkit.actions.chrome-page"];
const ChromePageExport = ref as tskb.Exports["omkit.chromePage"];
const ActionContextExport = ref as tskb.Exports["omkit.ActionContext"];

const ActionExport = ref as tskb.Exports["omkit.action"];
const ActivityExport = ref as tskb.Exports["omkit.Activity"];
const CapabilityTerm = ref as tskb.Terms["capability"];
const PlaywrightExternal = ref as tskb.Externals["playwright-core"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How do actions hand each other typed capabilities?">
    <H1>Capability handoff</H1>
    <P>
      Actions don't share globals. When one action needs a value another produced — a port, a
      client, a live browser page — it receives it as a {CapabilityTerm}: a runtime handoff that is
      typed end to end, not a string scraped from a log. Two calls carry it: <code>attach</code> on
      the producing side, <code>ref</code> on the receiving side.
    </P>

    <H2>Declaring and publishing</H2>
    <P>
      An action declares that it publishes a handle by chaining <code>.ref&lt;H&gt;()</code> when it
      is built with {ActionExport}. That type <code>H</code> then flows through the whole action:
      the {ActionContextExport} the body receives has an <code>attach(handle: H)</code>, and the
      launched activity's <code>ref</code> becomes a <code>Promise&lt;H&gt;</code>. Inside the body,
      calling <code>attach(value)</code> publishes the capability — it resolves the activity's{" "}
      <code>ref</code> and emits an <code>attached</code> milestone. The first attach wins; later
      ones are ignored.
    </P>

    <Relation from={ActionContextExport} to={CapabilityTerm} label="publishes one with attach()" />

    <H2>Receiving</H2>
    <P>
      A downstream action gets the capability by awaiting the producer's <code>ref</code> on its{" "}
      {ActivityExport} — a promise that resolves the moment the producer attaches. Because an
      action's arguments may themselves be promises, you pass the producer's <code>ref</code>{" "}
      straight in as an argument (<code>migrate(server.ref)</code>), and the consumer starts the
      instant the value is published. Unlike <code>result</code>, which never throws,{" "}
      <code>ref</code> rejects on failure or cancellation — a consumer waiting on a capability that
      never arrives fails rather than hanging. An action that publishes nothing still resolves its{" "}
      <code>ref</code> (with <code>undefined</code>) on success, so awaiting it never wedges.
    </P>

    <Relation from={ActivityExport} to={CapabilityTerm} label="delivers one through .ref" />

    <H2>The flagship: a live page</H2>
    <P>
      {ChromePageExport} in {ChromePageModule} is the clearest case. It attaches a Chromium{" "}
      <code>Page</code> as its capability, so a downstream smoke test awaits <code>page.ref</code>{" "}
      and drives the same live page — real DOM, real network — instead of a URL scraped from stdout.
      Its source argument can itself be another action's <code>ref</code>, so capabilities chain:{" "}
      <code>chromePage("app", chromedriver.ref)</code> wires one action's output straight into the
      next.
    </P>

    <Relation from={ChromePageExport} to={CapabilityTerm} label="publishes a live Page as" />
    <Relation from={ChromePageModule} to={PlaywrightExternal} label="gets the Page from" />
  </Doc>
);
