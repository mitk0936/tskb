import { describe, expect, test } from "vitest";
import { createChannel, type Transport } from "../../src/cli/client/channel.ts";
import type { ChildMessage, SupervisorMessage } from "../../src/core/interaction.ts";

/** A fake child transport the test drives directly. */
function fakeTransport() {
  const sent: SupervisorMessage[] = [];
  let onMsg: ((m: ChildMessage) => void) | undefined;
  let onClose: ((code: number | null) => void) | undefined;
  return {
    sent,
    transport: {
      send: (m: SupervisorMessage) => void sent.push(m),
      onMessage: (cb: (m: ChildMessage) => void) => void (onMsg = cb),
      onClose: (cb: (code: number | null) => void) => void (onClose = cb),
    } satisfies Transport,
    emit: (m: ChildMessage) => onMsg?.(m),
    close: (code: number | null) => onClose?.(code),
  };
}

const entry = {
  sequence: 1,
  ts: 0,
  nodeId: "main",
  path: "main",
  level: "event",
  source: "lifecycle",
  message: "done · ok",
};

describe("createChannel", () => {
  test("routes log/prompt and resolves result on settled", async () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);

    const logs: unknown[] = [];
    const prompts: string[] = [];
    session.on("log", (e) => logs.push(e));
    session.on("prompt", (r) => prompts.push(r.id));

    f.emit({ kind: "log", entry });
    f.emit({ kind: "prompt", id: "p1", spec: { kind: "input", message: "Name?", default: "" } });
    f.emit({ kind: "settled", ok: true, folder: "/runs/dev-abc" });

    expect(logs).toHaveLength(1);
    expect(prompts).toEqual(["p1"]);
    await expect(session.result).resolves.toEqual({ ok: true, folder: "/runs/dev-abc" });
  });

  test("answer and cancel send the right supervisor messages", () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);
    session.answer("p1", "Ada");
    session.answer("p2", "yes", "input");
    session.cancel();
    expect(f.sent).toEqual([
      { kind: "answer", id: "p1", value: "Ada", via: "input" },
      { kind: "answer", id: "p2", value: "yes", via: "input" },
      { kind: "cancel" },
    ]);
  });

  test("an unexpected close before settle resolves a failed verdict", async () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);
    f.close(1);
    await expect(session.result).resolves.toEqual({ ok: false, folder: "" });
  });
});
