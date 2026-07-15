/**
 * omkit (refactored core) — the ExecutionTree model.
 *
 * A curated public surface. `om(name, body)` runs a linear orchestration as the root of
 * one run; `action(...)` defines typed units you launch by **calling** them;
 * `step(name, fn)` is the inline anonymous action. The run's introspectable output
 * is the on-disk `result.json` / `raw.jsonl` / `.log` files — the ExecutionTree
 * engine itself is internal and intentionally not exported.
 */
export { om } from "./core/om.ts";
export { action } from "./core/action.ts";
export { step } from "./core/step.ts";
export { CancelledError, isCancelled } from "./foundation/CancelledError.ts";

export type { Action, Activity, ActionContext, OmContext, Outcome } from "./core/types.ts";
