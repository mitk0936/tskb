import type { LogStore } from "./log/LogStore.ts";
import { format } from "./milestones.ts";

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
 */
export class LiveRenderer {
  /** Tags accumulated per node from `tag` entries, so milestones can show them by name. */
  private readonly tagsByNode = new Map<string, string[]>();

  constructor(private readonly term: LiveTerminal) {}

  async run(store: LogStore): Promise<void> {
    for await (const entry of store.subscribe({ replay: true })) {
      if (entry.level === "tag" && entry.source === "tag") {
        const list = this.tagsByNode.get(entry.nodeId) ?? [];
        list.push(entry.message);
        this.tagsByNode.set(entry.nodeId, list);
        continue; // tags aren't their own line — they decorate the node's milestones
      }
      const rendered = format(entry, this.tagsByNode.get(entry.nodeId));
      if (rendered === null) continue;
      this.term.write(`${rendered.text}\n`);
    }
  }
}
