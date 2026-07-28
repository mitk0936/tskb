import type { LogStore } from "./log/LogStore.ts";
import { RunModel } from "./RunModel.ts";

/** The terminal surface the renderer appends to (process.stdout satisfies it). */
export interface LiveTerminal {
  write(text: string): unknown;
}

/**
 * Appends a **curated** stream of milestones — action launches, completions, errors, events,
 * asserts, snapshots — one line each, as the run goes. The in-place status-line rendering is
 * retired: the interactive surface is the Ink app (`omkit ui`); this reporter is the plain
 * output for bare `omkit run`, CI, and pipes. Writes through the given terminal directly (for
 * `process.stdout`, `patch-console` doesn't intercept it, so it can't feed console capture).
 *
 * Folds the stream through a {@link RunModel} — the same reducer the interactive app uses — so the
 * bare and supervised surfaces render a run identically (tags and all) rather than drifting apart.
 */
export class LiveRenderer {
  private readonly model = new RunModel();

  constructor(private readonly term: LiveTerminal) {}

  async run(store: LogStore): Promise<void> {
    for await (const entry of store.subscribe({ replay: true })) {
      const rendered = this.model.apply(entry);
      if (rendered) this.term.write(`${rendered.text}\n`);
    }
  }
}
