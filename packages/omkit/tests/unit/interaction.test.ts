import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSupervisor,
  installSupervisor,
  activeSupervisor,
  type ChildMessage,
  type SupervisorMessage,
} from "../../src/core/interaction.ts";

/** A two-way in-memory channel standing in for Node's fork IPC. */
function fakeChannel() {
  const sent: ChildMessage[] = [];
  let deliver: ((m: SupervisorMessage) => void) | undefined;
  return {
    sent,
    send: (m: ChildMessage) => void sent.push(m),
    onMessage: (cb: (m: SupervisorMessage) => void) => void (deliver = cb),
    // Simulate the supervisor sending a message down to the child.
    push: (m: SupervisorMessage) => deliver?.(m),
  };
}

afterEach(() => installSupervisor(null));

describe("interaction channel — child side", () => {
  test("request sends a prompt and resolves on the matching answer", async () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const ac = new AbortController();

    const pending = sup.request({ kind: "input", message: "Name?", default: "" }, ac.signal);

    expect(ch.sent).toHaveLength(1);
    const req = ch.sent[0];
    expect(req.kind).toBe("prompt");
    const id = req.kind === "prompt" ? req.id : "";
    expect(id).not.toBe("");

    ch.push({ kind: "answer", id, value: "Ada", via: "input" });
    await expect(pending).resolves.toEqual({ kind: "answer", id, value: "Ada", via: "input" });
  });

  test("an answer for an unknown id is ignored", async () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const ac = new AbortController();
    const pending = sup.request({ kind: "input", message: "?", default: "d" }, ac.signal);
    ch.push({ kind: "answer", id: "does-not-exist", value: "x", via: "input" });
    // Still pending: resolve the real one.
    const id = ch.sent[0].kind === "prompt" ? ch.sent[0].id : "";
    ch.push({ kind: "answer", id, value: "ok", via: "input" });
    await expect(pending).resolves.toMatchObject({ value: "ok" });
  });

  test("request rejects and forgets the pending id when the signal aborts", async () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const ac = new AbortController();
    const pending = sup.request({ kind: "input", message: "?", default: "d" }, ac.signal);
    ac.abort();
    await expect(pending).rejects.toThrow();
    // A late answer for the aborted id must not throw or resolve anything.
    const id = ch.sent[0].kind === "prompt" ? ch.sent[0].id : "";
    expect(() => ch.push({ kind: "answer", id, value: "late", via: "input" })).not.toThrow();
  });

  test("log and settled emit the right child messages", () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const entry = {
      sequence: 1,
      ts: 0,
      nodeId: "main",
      path: "main",
      level: "event",
      source: "lifecycle",
      message: "done · ok",
    };
    sup.log(entry);
    sup.settled(true, "/runs/dev-abc", ["om → /runs/dev-abc"]);
    expect(ch.sent).toEqual([
      { kind: "log", entry },
      { kind: "settled", ok: true, folder: "/runs/dev-abc", summary: ["om → /runs/dev-abc"] },
    ]);
  });

  test("onCancel fires when a cancel message arrives", () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const onCancel = vi.fn();
    sup.onCancel(onCancel);
    ch.push({ kind: "cancel" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test("installSupervisor overrides the active supervisor (test seam)", () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    expect(activeSupervisor()).toBeNull(); // unsupervised under vitest
    installSupervisor(sup);
    expect(activeSupervisor()).toBe(sup);
  });
});
