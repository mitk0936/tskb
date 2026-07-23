import type { ChildMessage, SupervisorMessage } from "../../core/interaction.ts";
import type { RunSession, RunEvents, Verdict } from "./types.ts";

/** The minimal duplex the channel needs — satisfied by a real ChildProcess or a fake. */
export interface Transport {
  send(message: SupervisorMessage): void;
  onMessage(handler: (message: ChildMessage) => void): void;
  onClose(handler: (code: number | null) => void): void;
}

/**
 * Turn a child transport into a {@link RunSession}: fan `log`/`prompt` child messages out to
 * handlers, resolve `result` on `settled`, and map `answer`/`cancel` back down the wire. A
 * close before `settled` resolves a failed verdict so `result` never hangs.
 */
export function createChannel(transport: Transport): RunSession {
  const handlers: { [K in keyof RunEvents]: RunEvents[K][] } = {
    log: [],
    prompt: [],
    settled: [],
  };
  let settled = false;
  let resolveResult!: (v: Verdict) => void;
  const result = new Promise<Verdict>((resolve) => (resolveResult = resolve));

  transport.onMessage((message) => {
    if (message.kind === "log") {
      for (const h of handlers.log) h(message.entry);
    } else if (message.kind === "prompt") {
      for (const h of handlers.prompt) h({ id: message.id, spec: message.spec });
    } else if (message.kind === "settled") {
      settled = true;
      const verdict: Verdict = { ok: message.ok, folder: message.folder, summary: message.summary };
      for (const h of handlers.settled) h(verdict);
      resolveResult(verdict);
    }
  });

  transport.onClose(() => {
    if (!settled) resolveResult({ ok: false, folder: "", summary: [] });
  });

  return {
    on(event, handler) {
      handlers[event].push(handler as never);
    },
    answer(id, value, via = "input") {
      transport.send({ kind: "answer", id, value, via });
    },
    cancel() {
      transport.send({ kind: "cancel" });
    },
    result,
  };
}
