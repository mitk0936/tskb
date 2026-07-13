import { createProc } from "../../system/process/process.ts";
import type { Emitter } from "../events/events.ts";
import type { ActionContext, SystemGlobal } from "./types.ts";

/**
 * Assemble the {@link ActionContext} handed to an action's `exec`: the injected
 * system services, plus this action's `emit`/`attach` and the per-action `proc`,
 * `artifactsFolder`, and `snapshot` convenience wired off `system.output`.
 */
export function buildContext<Events extends object, Handle>(
  system: SystemGlobal,
  emit: Emitter<Events>["emit"],
  attach: (handle: Handle) => void
): ActionContext<Events, Handle> {
  return {
    ...system,
    emit,
    attach,
    proc: createProc(system.logs, system.signal, system.output.snapshots),
    artifactsFolder: system.output.folder.artifacts(),
    snapshot: (name, value) => system.output.snapshots.snapshot(name, value),
  };
}
