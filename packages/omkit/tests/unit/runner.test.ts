import { afterAll, describe, expect, test } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { runOm } from "../../src/cli/client/runner.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const helloOm = path.join(here, "../fixtures/run/hello.ts");
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
