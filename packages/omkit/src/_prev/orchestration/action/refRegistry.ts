import type { AnyActionInstance } from "./types.ts";

// Maps an instance's `.ref` promise back to the instance that produces it, so the
// run can catch a consumer launched before (or without) its `.ref` producer —
// which would otherwise await a handle that never arrives and hang silently.
const refOwners = new WeakMap<object, AnyActionInstance>();

/** Record `instance` as the producer of its own `.ref` handle promise. */
export function registerRef(instance: AnyActionInstance): void {
  refOwners.set(instance.ref, instance);
}

/**
 * If `value` is some action instance's `.ref` promise, the instance that owns it
 * (the producer of that handle); otherwise `undefined`. Used by the run to verify
 * a `.ref` dependency was launched before the action that consumes it.
 */
export const producerOfRef = (value: unknown): AnyActionInstance | undefined =>
  typeof value === "object" && value !== null ? refOwners.get(value) : undefined;
