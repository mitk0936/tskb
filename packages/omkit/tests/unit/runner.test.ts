import { afterAll, describe, expect, test } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runOm } from "../../src/client/runner.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const helloOm = path.join(here, "../fixtures/run/hello.ts");
const loudOm = path.join(here, "../fixtures/run/loud.ts");
const brokenOm = path.join(here, "../fixtures/run/broken.ts");
// Run in a throwaway cwd so the child's logs/ folder lands in the OS temp dir, not the repo.
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-runner-"));

afterAll(() => {
  // Best-effort: on Windows the child's log-file handles can briefly linger, so retry and
  // swallow EPERM rather than failing the suite over temp-dir cleanup.
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

describe("runOm (real fork)", () => {
  test("runs a supervised om, round-trips a prompt, and settles ok", async () => {
    const session = runOm(helloOm, { cwd: workdir });
    const logs: LogEntry[] = [];
    session.on("log", (e) => logs.push(e));
    session.on("prompt", (req) => session.answer(req.id, "Ada"));

    const verdict = await session.result;
    expect(verdict.ok).toBe(true);
    expect(verdict.folder).toContain("hello-");
    // The greeted snapshot recorded the answered name → it flowed over the channel.
    expect(logs.some((e) => e.message.includes("greeted"))).toBe(true);
  }, 20_000);
});

describe("runOm (piped stdio)", () => {
  // stdout/stderr are piped so the child's raw output stays off the supervisor's terminal.
  // Nothing reads those pipes, so a child that writes past the OS buffer (~64 KB) blocks on
  // its next write — and since the supervisor only ever reads the IPC channel, it blocks
  // forever: the run never settles and the frontend hangs with it.
  test("a child that floods its own stdout/stderr still settles", async () => {
    const session = runOm(loudOm, { cwd: workdir });
    const verdict = await session.result;
    expect(verdict.ok).toBe(true);
  }, 30_000);

  // A child that dies during module load never opens the channel, so it reports nothing: no
  // folder, no summary, no logs. The reason went to its stderr, which the supervisor drains —
  // keeping the tail is what turns a bare "✗ failed" back into an actionable one.
  test("an om that dies before the channel opens reports why", async () => {
    const session = runOm(brokenOm, { cwd: workdir });
    const verdict = await session.result;

    expect(verdict.ok).toBe(false);
    expect(verdict.folder).toBe("");
    expect(verdict.summary.join("\n")).toContain("no-such-module");
  }, 20_000);
});
