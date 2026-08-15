import { describe, expect, test, vi } from "vitest";
import { attachProgress, isMilestone, toRequestedSchema } from "../../src/mcp/progress.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";
import type { RunSession } from "../../src/client/types.ts";

const at = (level: string, sequence = 1, message = "m"): LogEntry => ({
  sequence,
  ts: 0,
  nodeId: "main",
  path: "main",
  level,
  source: "run",
  message,
});

/** A session stub that only records its `log` subscribers and its cancel calls. */
function fakeSession(): {
  session: RunSession;
  emit: (e: LogEntry) => void;
  cancels: () => number;
} {
  const handlers: Array<(e: LogEntry) => void> = [];
  let cancelled = 0;
  const session = {
    on: (event: string, handler: unknown) => {
      if (event === "log") handlers.push(handler as (e: LogEntry) => void);
    },
    cancel: () => {
      cancelled += 1;
    },
    answer: () => {},
    result: new Promise(() => {}),
  } as unknown as RunSession;
  return {
    session,
    emit: (e) => handlers.forEach((h) => h(e)),
    cancels: () => cancelled,
  };
}

describe("isMilestone", () => {
  test("forwards the levels that mark something happening", () => {
    for (const level of ["run", "event", "assert", "error", "artifact", "child"]) {
      expect(isMilestone(at(level))).toBe(true);
    }
  });

  test("drops ordinary console narration, which would flood the channel", () => {
    expect(isMilestone(at("info"))).toBe(false);
    expect(isMilestone(at("tag"))).toBe(false);
  });
});

describe("toRequestedSchema", () => {
  test("maps a choice prompt to an enum, so the client can only answer validly", () => {
    expect(
      toRequestedSchema({
        kind: "choice",
        message: "Run tests?",
        default: "no",
        choices: [
          { label: "no", value: "no" },
          { label: "yes", value: "yes" },
        ],
      })
    ).toEqual({
      type: "object",
      properties: {
        value: { type: "string", enum: ["no", "yes"], description: "Run tests?" },
      },
      required: ["value"],
    });
  });

  test("maps an input prompt to a plain string, carrying the hint into the description", () => {
    expect(
      toRequestedSchema({ kind: "input", message: "token", default: "", hint: "a string" })
    ).toEqual({
      type: "object",
      properties: { value: { type: "string", description: "token — a string" } },
      required: ["value"],
    });
  });

  test("a multiline prompt is still one string field — MCP's schema allows no nesting", () => {
    const schema = toRequestedSchema({ kind: "multiline", message: "config JSON", default: "" });
    expect(schema.properties.value!.type).toBe("string");
    expect(schema.properties.value!.enum).toBeUndefined();
  });
});

describe("attachProgress", () => {
  test("emits one notification per milestone, with the log sequence as progress", async () => {
    const sendNotification = vi.fn(async () => {});
    const { session, emit } = fakeSession();

    attachProgress(session, {
      _meta: { progressToken: "tok" },
      signal: new AbortController().signal,
      sendNotification,
    });

    emit(at("event", 7, "server up"));
    emit(at("info", 8, "noise"));

    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification.mock.calls[0]![0]).toMatchObject({
      method: "notifications/progress",
      params: { progressToken: "tok", progress: 7, message: "server up" },
    });
  });

  test("progress increases monotonically, as the spec requires", async () => {
    const sendNotification = vi.fn(async () => {});
    const { session, emit } = fakeSession();
    attachProgress(session, {
      _meta: { progressToken: 1 },
      signal: new AbortController().signal,
      sendNotification,
    });

    for (const seq of [2, 5, 9]) emit(at("event", seq));
    const values = sendNotification.mock.calls.map(
      (c) => (c[0] as never as Progress).params.progress
    );
    expect(values).toEqual([2, 5, 9]);
  });

  test("sends nothing when the client supplied no progress token", () => {
    const sendNotification = vi.fn(async () => {});
    const { session, emit } = fakeSession();
    attachProgress(session, { signal: new AbortController().signal, sendNotification });
    emit(at("event", 1));
    expect(sendNotification).not.toHaveBeenCalled();
  });

  test("an aborted request cancels the run", () => {
    const { session, cancels } = fakeSession();
    const controller = new AbortController();
    attachProgress(session, {
      signal: controller.signal,
      sendNotification: async () => {},
    });
    controller.abort();
    expect(cancels()).toBe(1);
  });

  test("a rejected notification does not fault the run", () => {
    const sendNotification = vi.fn(async () => {
      throw new Error("client gone");
    });
    const { session, emit } = fakeSession();
    attachProgress(session, {
      _meta: { progressToken: "tok" },
      signal: new AbortController().signal,
      sendNotification,
    });
    expect(() => emit(at("event", 1))).not.toThrow();
  });
});

type Progress = { params: { progress: number } };
