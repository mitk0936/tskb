import { spawn, type ChildProcess } from "node:child_process";
import { appendFile, mkdtemp, rename, rm, truncate, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { tailLog, type TailLogOptions } from "../../src/actions/tail-log.ts";
import { untilLog } from "../../src/actions/until-log.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const heldWriter = path.resolve(import.meta.dirname, "../fixtures/tail-log/held-writer.mjs");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const range = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

let dir: string;
let file: string;
const children: ChildProcess[] = [];

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "omkit-taillog-test-"));
  file = path.join(dir, "app.log");
});

afterEach(async () => {
  for (const child of children.splice(0)) child.kill();
  ExecutionTree.reset();
  process.exitCode = 0;
  await rm(dir, { recursive: true, force: true, maxRetries: 5 });
});

/** The file lines tailLog put in its own log (drops its banner and any `[diag]` lines). */
const tailedLines = (tailId: string): string[] =>
  ExecutionTree.last!.store.entries()
    .filter((e) => e.nodeId === tailId && e.level === "info" && e.source === "console")
    .map((e) => e.message)
    .filter((m) => !m.startsWith("tailing ") && !m.startsWith("[diag]"));

/** Spawn the held-open external writer; resolves once it has written its last line. */
function externalWriter(prefix: string, count: number, intervalMs: number, burst = 1) {
  const child = spawn(
    process.execPath,
    [heldWriter, file, prefix, String(count), String(intervalMs), String(burst)],
    { stdio: ["ignore", "pipe", "inherit"] }
  );
  children.push(child);
  return new Promise<void>((resolve) => child.stdout!.on("data", () => resolve()));
}

/**
 * Run tailLog under an om, drive `write`, and wait (via untilLog) for `last` to reach the run
 * log. Returns what untilLog matched and what tailLog logged, so each is asserted separately.
 */
async function tailUntil(
  opts: TailLogOptions,
  last: string,
  write: () => Promise<void>
): Promise<{ matched?: LogEntry; untilError?: unknown; lines: string[] }> {
  let tailId = "";
  let matched: LogEntry | undefined;
  let untilError: unknown;
  await om("tail-log").run(async ({ cancel }) => {
    const tail = tailLog(file, opts);
    tailId = tail.id;
    await sleep(100); // watcher installed + any fromStart replay done
    const gate = untilLog((e) => e.nodeId === tailId && e.message === last, {
      replay: true,
      timeoutMs: 8_000,
    });
    await write();
    try {
      matched = await gate.result;
    } catch (err) {
      untilError = err;
    }
    await sleep(300); // a late duplicate would land here
    cancel();
  });
  return { matched, untilError, lines: tailedLines(tailId) };
}

describe.each([
  { label: "default debounce", debounce: {} },
  { label: "debounceMs: 0", debounce: { debounceMs: 0 } },
])("tailLog + untilLog ($label)", ({ debounce }) => {
  test("replays existing lines, then delivers lines appended after the initial read", async () => {
    await writeFile(file, "pre-0\npre-1\n");
    const out = await tailUntil({ ...debounce, fromStart: true }, "post-4", async () => {
      for (const line of range("post", 5)) {
        await appendFile(file, `${line}\n`);
        await sleep(30);
      }
    });
    expect(out.untilError).toBeUndefined();
    expect(out.matched?.message).toBe("post-4");
    expect(out.lines).toEqual(["pre-0", "pre-1", ...range("post", 5)]);
  });

  test("starts before the file exists, then follows its creation and appends", async () => {
    const out = await tailUntil(debounce, "late-3", async () => {
      await writeFile(file, "late-0\n");
      for (const line of range("late", 4).slice(1)) {
        await sleep(30);
        await appendFile(file, `${line}\n`);
      }
    });
    expect(out.untilError).toBeUndefined();
    expect(out.lines).toEqual(range("late", 4));
  });

  test("follows a separate process that holds the file open (sustained writes)", async () => {
    await writeFile(file, "pre-0\n");
    const out = await tailUntil({ ...debounce, fromStart: true }, "ext-39", () =>
      externalWriter("ext", 40, 30)
    );
    expect(out.untilError).toBeUndefined();
    expect(out.matched?.message).toBe("ext-39");
    expect(out.lines).toEqual(["pre-0", ...range("ext", 40)]);
  });

  test("follows a separate process writing in bursts", async () => {
    await writeFile(file, "");
    const out = await tailUntil({ ...debounce, fromStart: true }, "burst-99", () =>
      externalWriter("burst", 100, 200, 25)
    );
    expect(out.untilError).toBeUndefined();
    expect(out.lines).toEqual(range("burst", 100));
  });

  test("buffers a partial line until its newline", async () => {
    await writeFile(file, "");
    const out = await tailUntil({ ...debounce, fromStart: true }, "abcdef", async () => {
      await appendFile(file, "abc");
      await sleep(200); // long enough for the partial to be read on its own
      await appendFile(file, "def\nnext");
    });
    expect(out.untilError).toBeUndefined();
    // "next" has no newline: buffered, then flushed exactly once on teardown.
    expect(out.lines).toEqual(["abcdef", "next"]);
  });

  test("restarts from the top after truncation", async () => {
    await writeFile(file, "old-0\nold-1\nold-2\n");
    const out = await tailUntil({ ...debounce, fromStart: true }, "new-0", async () => {
      await sleep(100);
      await truncate(file, 0);
      await appendFile(file, "new-0\n");
    });
    expect(out.untilError).toBeUndefined();
    expect(out.lines).toEqual(["old-0", "old-1", "old-2", "new-0"]);
  });

  test("stops reading and polling once cancelled", async () => {
    await writeFile(file, "before-0\n");
    const out = await tailUntil(
      { ...debounce, fromStart: true, pollMs: 50, diagnostics: true },
      "before-0",
      async () => {}
    );
    expect(out.lines).toEqual(["before-0"]);
    const count = ExecutionTree.last!.store.entries().length;
    await appendFile(file, "after-0\n");
    await sleep(400); // several poll periods: a leaked interval/watcher would read and log
    expect(ExecutionTree.last!.store.entries().length).toBe(count);
  });

  test("follows a rename-and-recreate rotation", async () => {
    await writeFile(file, "gen1-0\ngen1-1\ngen1-2\n");
    const out = await tailUntil({ ...debounce, fromStart: true }, "gen2-1", async () => {
      await sleep(100);
      await rename(file, `${file}.1`);
      await writeFile(file, "gen2-0\n"); // shorter than the consumed offset
      await sleep(100);
      await appendFile(file, "gen2-1\n");
    });
    expect(out.untilError).toBeUndefined();
    expect(out.lines).toEqual(["gen1-0", "gen1-1", "gen1-2", "gen2-0", "gen2-1"]);
  });
});
