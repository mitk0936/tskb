import { describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOmkitClient } from "../../src/cli/client/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsconfig = path.join(here, "../fixtures/discovery/tsconfig.omkit.json");

describe("createOmkitClient", () => {
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
});
