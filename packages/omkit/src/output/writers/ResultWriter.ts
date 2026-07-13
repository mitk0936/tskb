import { writeFile } from "node:fs/promises";
import type { RunView } from "./views.ts";

/** Serializes the whole run tree + verdict to `result.json`. */
export async function writeResult(file: string, run: RunView): Promise<void> {
  await writeFile(file, `${JSON.stringify(run, null, 2)}\n`, "utf8");
}
