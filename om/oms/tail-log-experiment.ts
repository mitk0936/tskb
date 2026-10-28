import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { om } from "omkit";
import { command, tailLog, untilLog } from "omkit/actions";

// The writer script sits at om/scripts; resolve from this file, not cwd (see tskb-build.ts).
const writer = path.resolve(import.meta.dirname, "../scripts/held-log-writer.mjs");

/**
 * Supply as JSON, e.g. OMKIT_ARGS='{"debounceMs":0,"burst":10}'.
 */
const experimentArgs = z.object({
  /** Lines the external writer appends after tailing starts. */
  lines: z.number().int().positive().default(40),
  /** Delay between writer ticks. */
  intervalMs: z.number().int().positive().default(50),
  /** Lines appended per writer tick (>1 = bursts). */
  burst: z.number().int().positive().default(1),
  /** Passed straight to tailLog. */
  debounceMs: z.number().int().nonnegative().default(50),
  /** How long untilLog waits for the writer's last line to reach tailLog's log. */
  timeoutMs: z.number().int().positive().default(10_000),
});

om("tailLog:experiment")
  .describe({
    summary:
      "Reproduce tailLog live delivery against an external writer that holds its log file open.",
  })
  .mcp()
  .args(experimentArgs)
  .run(async ({ snapshot, cancel }, { lines, intervalMs, burst, debounceMs, timeoutMs }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-taillog-"));
    const file = path.join(dir, "app.log");
    fs.writeFileSync(file, "pre-0\npre-1\n");

    const tail = tailLog(file, { fromStart: true, debounceMs }).tag("tail");
    // Replay first, so the writer's lines are unambiguously live appends.
    await untilLog((e) => e.path.includes("tailLog") && e.message === "pre-1", {
      replay: true,
      timeoutMs,
    }).result;

    command(process.execPath, {
      args: [writer, file, String(lines), String(intervalMs), String(burst)],
    }).tag("writer");

    const last = `line-${lines - 1}`;
    let delivered = true;
    try {
      await untilLog((e) => e.path.includes("tailLog") && e.message === last, {
        replay: true,
        timeoutMs,
      }).result;
    } catch {
      delivered = false;
    }

    const onDisk = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).length;
    void snapshot("result", { delivered, expectedLast: last, linesOnDisk: onDisk, file });
    tail.cancel();
    cancel();
    fs.rmSync(dir, { recursive: true, force: true });
    if (!delivered) throw new Error(`tailLog never delivered ${last} (on disk: ${onDisk} lines)`);
  });
