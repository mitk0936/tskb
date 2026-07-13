import { Console as NodeConsole } from "node:console";
import patchConsole from "patch-console";
import type { ActionRef } from "../../foundation/ActionRef.ts";
import type { LogStore } from "../log/LogStore.ts";

/** Resolves the action a console call should be attributed to (the ALS current node). */
export type AttributionProvider = () => ActionRef | undefined;

/**
 * Folds every `console.*` call made during the run into the log, attributed to the
 * action it was called in. Uses `patch-console`, which swaps the whole console
 * surface (`log`/`table`/`trace`/`group`/…) over a captured `Console`, so native
 * formatting is preserved. Level is stream-granular: stdout → `info`, stderr →
 * `error`. The `AttributionProvider` (injected by `core`, wired to the ALS) keeps
 * this layer ignorant of the execution tree.
 */
export class ConsoleCapture {
  private restore: (() => void) | undefined;

  constructor(
    private readonly store: LogStore,
    private readonly attribution: AttributionProvider
  ) {}

  install(): void {
    // patch-console does `new console.Console(...)`; some runners (vitest) swap the
    // global console for one without `.Console`, so fill it from node:console.
    const globalConsole = console as unknown as { Console?: unknown };
    if (typeof globalConsole.Console !== "function") globalConsole.Console = NodeConsole;

    this.restore = patchConsole((stream, data) => {
      const ref = this.attribution();
      if (!ref) return;
      const level = stream === "stderr" ? "error" : "info";
      for (const line of data.split("\n")) {
        if (line.length === 0) continue;
        this.store.append({
          nodeId: ref.id,
          path: ref.path,
          level,
          source: "console",
          message: line,
        });
      }
    });
  }

  uninstall(): void {
    this.restore?.();
    this.restore = undefined;
  }
}
