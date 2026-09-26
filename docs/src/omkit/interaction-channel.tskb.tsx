import { type Export, Doc, H1, H2, P, Flow, Step, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Exports {
      "omkit.client.Transport": Export<{
        desc: "The duplex seam the channel is built on — send / onMessage / onClose — so a real forked child or a test fake both drive a run the same way.";
        type: import("packages/omkit/src/client/channel.js").Transport;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ChannelModule = ref as tskb.Modules["omkit.client.channel"];
const InteractionModule = ref as tskb.Modules["omkit.core.interaction"];
const SupervisorExport = ref as tskb.Exports["omkit.core.Supervisor"];
const TransportExport = ref as tskb.Exports["omkit.client.Transport"];
const RunSessionExport = ref as tskb.Exports["omkit.RunSession"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How do the supervisor and the om child talk?" priority="supplementary">
    <H1>The supervisor–child channel</H1>
    <P>
      A supervised run is two processes with no shared memory, so everything the frontend needs from
      the om travels as typed messages over an IPC channel. The child side is {SupervisorExport} in{" "}
      {InteractionModule}; the supervisor side is {ChannelModule}. Both speak the same small
      vocabulary, defined once in {InteractionModule}: the child sends <em>logs</em>,{" "}
      <em>prompt</em>, <em>prompt-done</em>, <em>up</em>, and <em>settled</em>; the supervisor sends
      back <em>answer</em> and <em>cancel</em>.
    </P>

    <H2>Logs travel in batches</H2>
    <P>
      {SupervisorExport} holds log entries for a few milliseconds and sends each burst as one{" "}
      <em>logs</em> message. Every IPC message costs the supervisor an event-loop turn — on Windows
      Node delivers at most one per turn — so a message per entry let a chatty run outpace a
      frontend with slow frames: the interactive app kept replaying the log long after the run had
      finished, with <em>settled</em> stuck behind the backlog. Any other message flushes the
      pending batch first, so the entries that led to a prompt, and a run's closing entries, still
      arrive before it.
    </P>

    <H2>A transport, not the wire</H2>
    <P>
      {ChannelModule} is built on {TransportExport} — a three-method seam (send, onMessage, onClose)
      rather than the Node IPC calls directly. A real forked child and a fake in a test satisfy the
      same seam, so the whole run session can be exercised without spawning a process.
    </P>

    <H2>From messages to a session</H2>
    <P>
      The supervisor side turns that message stream into a {RunSessionExport}: each batch fans out
      as one log event per entry, prompts go to the caller's listeners, and <em>settled</em>{" "}
      resolves the verdict. If the child closes before it settles, the session resolves a failed
      verdict anyway, so a caller awaiting the result never hangs on a crashed child.
    </P>

    <Relation from={ChannelModule} to={InteractionModule} label="speaks the protocol of" />
    <Relation from={ChannelModule} to={TransportExport} label="built on" />

    <Flow
      name="omkit-prompt-roundtrip"
      desc="A supervised om asks a question: the request travels up the channel, a frontend answers, and the answer returns to unblock the child"
    >
      <Step node={InteractionModule} label="an om action asks a prompt and waits" />
      <Step node={ChannelModule} label="receives it and emits a prompt on the run session" />
      <Step node={RunSessionExport} label="the frontend renders it and sends an answer back" />
      <Step node={InteractionModule} label="matches the answer and resolves the waiting prompt" />
    </Flow>
  </Doc>
);
