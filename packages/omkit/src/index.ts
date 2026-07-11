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
export { action } from "./orchestration/action/action.ts";
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
  Outcome,
} from "./orchestration/action/types.ts";
export { AssertionError } from "./orchestration/assert.ts";
export type { Assert } from "./orchestration/assert.ts";

// ── Spin (linear orchestration) ──────────────────────────────────────────────
export { spin } from "./orchestration/spin/spin.ts";
export type { Nod, SpinContext, SpinBody } from "./orchestration/spin/types.ts";

// ── Events ─────────────────────────────────────────────────────────────────
export { events } from "./orchestration/events/events.ts";
export type { Emitter, EventHandler, EventMeta } from "./orchestration/events/events.ts";

// ── Child processes ────────────────────────────────────────────────────────
export { createProc } from "./system/process/process.ts";
export type { Proc } from "./system/process/process.ts";

// ── The log ────────────────────────────────────────────────────────────────
export { LogsCollector } from "./output/log/LogsCollector.ts";
export type { Logger, LogEntry, LogInput, SubscribeOptions } from "./output/log/LogsCollector.ts";

// ── Snapshots & artifacts ────────────────────────────────────────────────────
// The output subsystem is owned per-run by the spin and reached through context —
// `ctx.output` (folder / snapshots / runLog) inside an action, `ctx.snapshot` and
// `ctx.artifactsFolder` inside a spin body. The classes are exported for typing and
// advanced use; there is no process-global singleton or free-function form.
export { Output } from "./output/index.ts";
export type { SnapshotRef } from "./output/index.ts";

// ── Folder cache ─────────────────────────────────────────────────────────────
// Backs the `.withCache(...inputs)` method on instances (fingerprints an
// action's input files/folders, not its outputs); exposed for scripts that want
// to inspect or manually invalidate the cache — `FolderCache.fingerprint(...)`,
// `FolderCache.dir`.
export { FolderCache } from "./system/fs/FolderCache.ts";
