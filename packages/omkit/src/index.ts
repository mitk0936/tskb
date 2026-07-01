/**
 * tswm — the operational/runtime layer to tskb's knowledge layer.
 *
 * The core engine: define typed {@link action}s, launch them under one
 * {@link run}, and share a single append-only log. Reusable actions built on
 * this engine live at the `tswm/actions` entry point.
 *
 * This is a curated public surface — internal helpers (the async queue, the log
 * renderer, marker prefixing) are intentionally not exported.
 */

// ── Actions ────────────────────────────────────────────────────────────────
export { action } from "./core/action.ts";
export type {
  Action,
  ActionBuilder,
  ActionInstance,
  AnyActionInstance,
  ActionContext,
  SystemGlobal,
  SystemEvents,
  InstanceEvents,
  NoEvents,
  Awaitable,
} from "./core/action.ts";

// ── Runs ───────────────────────────────────────────────────────────────────
export { run } from "./core/run.ts";
export type { Run, RunResult, RunOptions, RunState, ActionFailure } from "./core/run.ts";

// ── Spin (linear orchestration) ──────────────────────────────────────────────
export { spin } from "./core/spin.ts";
export type { Nod, SpinOptions, SpinContext, SpinBody } from "./core/spin.ts";

// ── Events ─────────────────────────────────────────────────────────────────
export { events } from "./core/events.ts";
export type { Emitter, EventHandler, EventMeta } from "./core/events.ts";

// ── Child processes ────────────────────────────────────────────────────────
export { createProc } from "./core/process.ts";
export type { Proc } from "./core/process.ts";

// ── The log ────────────────────────────────────────────────────────────────
export { LogsCollector } from "./core/log-collector/LogsCollector.ts";
export type {
  Logger,
  LogEntry,
  LogInput,
  SubscribeOptions,
} from "./core/log-collector/LogsCollector.ts";
export { log } from "./core/log-collector/global.ts";

// ── Snapshots ──────────────────────────────────────────────────────────────
export { snapshot, captureSnapshot } from "./core/output.ts";
export type { SnapshotRef } from "./core/output.ts";
