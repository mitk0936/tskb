import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fsSafe } from "../../foundation/fsSafe.ts";
import type { RunFolder } from "../folder/RunFolder.ts";

/**
 * Writes JSON snapshot payloads under the run folder's `snapshots/` dir and returns
 * each file's **absolute** path (for an absolute link in the log). Sequenced so
 * names are unique and ordered; attribution (the timeline line) is the caller's job.
 */
export class SnapshotStore {
  private seq = 0;

  constructor(private readonly folder: RunFolder) {}

  async write(name: string, value: unknown, nodeId: string): Promise<string> {
    const file = this.folder.file(
      path.join("snapshots", `${++this.seq}-${fsSafe(nodeId)}-${fsSafe(name)}.json`)
    );
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    return file;
  }
}
