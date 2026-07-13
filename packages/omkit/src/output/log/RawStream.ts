import { createWriteStream, type WriteStream } from "node:fs";
import type { LogStore } from "./LogStore.ts";

/**
 * Streams every entry to `raw.jsonl` as one JSON object per line, live, for the
 * whole run — the crash-insurance / machine-merge record. `run(store)` subscribes
 * (replay + live) and resolves once the store closes and the file is flushed.
 */
export class RawStream {
  private readonly file: WriteStream;

  constructor(absPath: string) {
    this.file = createWriteStream(absPath, { flags: "w" });
  }

  async run(store: LogStore): Promise<void> {
    for await (const entry of store.subscribe({ replay: true })) {
      this.file.write(`${JSON.stringify(entry)}\n`);
    }
    await new Promise<void>((resolve) => this.file.end(resolve));
  }
}
