import type { SystemGlobal } from "./types.ts";

/**
 * Log one emit onto the run timeline, through the action's scoped `logs` so the
 * line carries its path. Fields are `·`-delimited — action name · key · payload.
 * A string payload rides inline; a richer one is written to a snapshot file and
 * linked (`→ <rel>`) so the durable record keeps it without bloating the line.
 * This is the sole place emits become log lines — the bus itself does no logging.
 */
export function logEmit(system: SystemGlobal, name: string, key: string, payload: unknown): void {
  const fields = [name, key];
  if (typeof payload === "string") {
    fields.push(payload);
  } else if (payload !== undefined) {
    fields.push(`→ ${system.output.snapshots.captureJson(`event-${name}-${key}`, payload).rel}`);
  }
  system.logs.append({ source: "event", level: "event", message: fields.join(" · ") });
}
