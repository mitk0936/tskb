import { AsyncLocalStorage } from "node:async_hooks";
import type { ActionRun } from "./ActionRun.ts";

/**
 * Holds the **current node** for the duration of an exec. Read when an action is
 * launched (to find its parent) and by console capture (to attribute a `console.*`
 * line) — the single ambient mechanism that replaces `nod` and makes scoping
 * compose without threading anything by hand.
 */
export const currentNode = new AsyncLocalStorage<ActionRun>();
