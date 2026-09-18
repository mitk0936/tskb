import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { LogEntry } from "../foundation/LogEntry.ts";
import type { PromptSpec } from "../core/interaction.ts";
import type { PromptRequest, RunSession } from "../client/types.ts";

/**
 * Which log levels count as "something happened". Forwarding every entry would turn a
 * chatty run into a notification flood; these are the levels that mark a step, an event,
 * an assertion, a failure, or a file — the same shape the terminal's live renderer treats
 * as worth showing.
 */
const MILESTONE_LEVELS = new Set(["run", "event", "assert", "error", "artifact", "child"]);

export function isMilestone(entry: LogEntry): boolean {
  return MILESTONE_LEVELS.has(entry.level);
}

/** The slice of the SDK's request context this module needs — narrow, so tests can fake it. */
export interface ProgressExtra {
  readonly signal: AbortSignal;
  readonly _meta?: { progressToken?: string | number };
  readonly sendNotification: (n: {
    method: "notifications/progress";
    params: { progressToken: string | number; progress: number; message?: string };
  }) => Promise<void>;
}

/**
 * Wire a live run to the request that started it: milestones become progress
 * notifications, and the client cancelling the request tears the run down.
 *
 * `progress` is the log store's run-global sequence, which is monotonic by construction —
 * exactly what the spec requires, with no counter to keep. `total` is omitted, which the
 * spec permits, because a run does not know how many steps it has left.
 *
 * Progress is a courtesy, not a deadline extension: whether a client resets its timeout on
 * progress is implementation-dependent, so a long run still belongs in `start_om`.
 */
export function attachProgress(session: RunSession, extra: ProgressExtra): void {
  const token = extra._meta?.progressToken;
  if (token !== undefined) {
    session.on("log", (entry) => {
      if (!isMilestone(entry)) return;
      void extra
        .sendNotification({
          method: "notifications/progress",
          params: { progressToken: token, progress: entry.sequence, message: entry.message },
        })
        .catch(() => {
          // The client went away mid-run. It is cancelled through `signal` anyway; a
          // rejected notification must not fault the run itself.
        });
    });
  }
  extra.signal.addEventListener("abort", () => session.cancel(), { once: true });
}

/** MCP's elicitation schema: top-level primitives only, no nesting. */
export interface RequestedSchema {
  type: "object";
  properties: Record<string, { type: "string"; enum?: string[]; description: string }>;
  required: string[];
}

/**
 * Turn one of omkit's prompt specs into an elicitation request. All three kinds become a
 * single `value` string: a choice narrows it with `enum` so the client cannot answer
 * invalidly, and a multiline prompt stays a string because MCP's restricted schema has
 * nowhere to say "several lines".
 */
export function toRequestedSchema(spec: PromptSpec): RequestedSchema {
  const description = spec.hint ? `${spec.message} — ${spec.hint}` : spec.message;
  const value =
    spec.kind === "choice" && spec.choices
      ? { type: "string" as const, enum: spec.choices.map((c) => c.value), description }
      : { type: "string" as const, description };
  return { type: "object", properties: { value }, required: ["value"] };
}

/**
 * Forward the run's prompts to the client as elicitations, and its answers back.
 *
 * prompt.ts already describes its supervisor as "whoever owns the terminal (Ink app / MCP
 * client)" — this is that. A declined or cancelled elicitation answers with the prompt's
 * own default rather than leaving the run to time out three times over: the run has to
 * make progress either way, and the default is what a timeout would have produced.
 *
 * `promptDone` means the child gave up first; the in-flight elicitation is aborted so the
 * client's dialog does not linger with nothing behind it.
 */
export function attachElicitation(server: McpServer, session: RunSession): void {
  const pending = new Map<string, AbortController>();

  session.on("promptDone", (id) => {
    pending.get(id)?.abort();
    pending.delete(id);
  });

  session.on("prompt", (request: PromptRequest) => {
    const controller = new AbortController();
    pending.set(request.id, controller);
    void (async () => {
      try {
        const result = await server.server.elicitInput(
          { message: request.spec.message, requestedSchema: toRequestedSchema(request.spec) },
          { signal: controller.signal }
        );
        const answer = result.content?.value;
        const value =
          result.action === "accept" && typeof answer === "string" ? answer : request.spec.default;
        session.answer(request.id, value, result.action === "accept" ? "elicitation" : "default");
      } catch {
        // Aborted, or a client with no elicitation capability. Either way the run must not
        // hang on us: hand it the default and let it carry on.
        if (!controller.signal.aborted) session.answer(request.id, request.spec.default, "default");
      } finally {
        pending.delete(request.id);
      }
    })();
  });
}
