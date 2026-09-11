import { describe, expect, test } from "vitest";
import { createChannel, type Transport } from "../../src/client/channel.ts";
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
    f.emit({ kind: "settled", ok: true, folder: "/runs/dev-abc", summary: ["om → /runs/dev-abc"] });

    expect(logs).toHaveLength(1);
    expect(prompts).toEqual(["p1"]);
    await expect(session.result).resolves.toEqual({
      ok: true,
      folder: "/runs/dev-abc",
      summary: ["om → /runs/dev-abc"],
    });
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

  test("a prompt-done message fires promptDone with the withdrawn id", () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);

    const done: string[] = [];
    session.on("promptDone", (id) => done.push(id));

    f.emit({ kind: "prompt", id: "p1", spec: { kind: "input", message: "Name?", default: "" } });
    f.emit({ kind: "prompt-done", id: "p1" });

    expect(done).toEqual(["p1"]);
  });

  test("an unexpected close before settle resolves a failed verdict", async () => {
    const f = fakeTransport();
    const session = createChannel(f.transport);
    f.close(1);
    await expect(session.result).resolves.toEqual({ ok: false, folder: "", summary: [] });
  });

  test("a close before settle carries the child's own output as the summary", async () => {
    // The child never reached `settled`, so it has no summary of its own — and a verdict with
    // nothing in it tells the user only that something failed, never what.
    const f = fakeTransport();
    const session = createChannel({
      ...f.transport,
      diagnostics: () => ["Error: Cannot find module './nope.ts'", "  at loadESM (node:internal)"],
    });
    f.close(1);

    await expect(session.result).resolves.toEqual({
      ok: false,
      folder: "",
      summary: [
        "the run ended before it could report:",
        "Error: Cannot find module './nope.ts'",
        "  at loadESM (node:internal)",
      ],
    });
  });

  test("a run that reports for itself is not second-guessed by its raw output", async () => {
    // `settled` is the run's own account. Node prints warnings and inspector banners to the
    // same streams, so a diagnostic tail must never dilute a verdict the run already gave.
    const f = fakeTransport();
    const session = createChannel({ ...f.transport, diagnostics: () => ["ExperimentalWarning"] });
    f.emit({ kind: "settled", ok: true, folder: "/runs/dev-abc", summary: ["om → /runs/dev-abc"] });
    f.close(0);

    await expect(session.result).resolves.toEqual({
      ok: true,
      folder: "/runs/dev-abc",
      summary: ["om → /runs/dev-abc"],
    });
  });
});
