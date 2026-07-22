import { afterAll, describe, expect, test } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveOm } from "../../src/cli/commands/run.ts";
import { spawnBare } from "../../src/cli/client/runner.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const runDir = path.join(here, "../fixtures/run");
// A throwaway cwd so the child's logs/ folder lands in the OS temp dir, not the repo.
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-run-"));

afterAll(() => {
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

describe("resolveOm", () => {
  const registry = { oms: [{ name: "hello", file: path.join(runDir, "hello.ts") }] };

  test("resolves an existing file path argument", () => {
    const rel = path.join("..", "fixtures", "run", "hello.ts");
    expect(resolveOm(rel, registry, here)).toBe(path.resolve(here, rel));
  });

  test("resolves a bare om name against the registry", () => {
    expect(resolveOm("hello", registry, here)).toBe(path.join(runDir, "hello.ts"));
  });

  test("returns undefined for an unknown target", () => {
    expect(resolveOm("nope", registry, here)).toBeUndefined();
  });
});

describe("spawnBare", () => {
  test("runs an om unsupervised to completion and returns exit code 0", async () => {
    // hello.ts prompts with a 5s timeout; unsupervised + non-tty stdin → it falls back to
    // the default and exits cleanly.
    const code = await spawnBare(path.join(runDir, "hello.ts"), { cwd: workdir });
    expect(code).toBe(0);
  }, 20_000);
});
