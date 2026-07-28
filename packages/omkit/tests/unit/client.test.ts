import { afterAll, describe, expect, test } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createOmkitClient } from "../../src/client/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsconfig = path.join(here, "../fixtures/discovery/tsconfig.omkit.json");
const helloOm = path.join(here, "../fixtures/run/hello.ts");
// A throwaway cwd so a bare run's logs/ folder lands in the OS temp dir, not the repo.
const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-client-"));

afterAll(() => {
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

describe("createOmkitClient", () => {
  test("exposes its tsconfig as the single source of the config path", () => {
    const client = createOmkitClient({ tsconfig });
    expect(client.tsconfig).toBe(tsconfig);
  });

  test("discover() surfaces the project's oms and actions", async () => {
    const client = createOmkitClient({ tsconfig });
    const registry = await client.discover();
    expect(registry.oms.map((o) => o.name).sort()).toEqual(["build", "dev"]);
    expect(registry.actions.some((a) => a.name === "build")).toBe(true);
  });

  test("check() reports the broken fixture's type error", async () => {
    const client = createOmkitClient({ tsconfig });
    const diagnostics = await client.check();
    expect(diagnostics.some((d) => path.basename(d.file) === "broken.ts")).toBe(true);
  });

  test("runBare() runs an om unsupervised through the facade and resolves its exit code", async () => {
    const client = createOmkitClient({ tsconfig });
    const code = await client.runBare(helloOm, { cwd: workdir });
    expect(code).toBe(0);
  }, 20_000);
});
