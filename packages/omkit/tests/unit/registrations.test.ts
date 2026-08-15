import { beforeAll, describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegistrations } from "../../src/client/discovery.ts";
import type { RegistrationSet } from "../../src/client/registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "../fixtures/registrations");
const files = [
  path.join(fixtures, "oms/exposed.ts"),
  path.join(fixtures, "oms/hidden.ts"),
  path.join(fixtures, "oms/explodes.ts"),
  path.join(fixtures, "actions/seed.ts"),
];

// One fork for the whole file: it is the unit under test, and forking per assertion would
// multiply a ~2s cost by seven for no extra coverage.
let set: RegistrationSet;
beforeAll(async () => {
  set = await readRegistrations(files);
}, 40_000);

describe("readRegistrations", () => {
  test("reads an om's summary, mode and args schema without running its body", () => {
    const exposed = set.oms.find((o) => o.name === "exposed")!;
    expect(exposed.summary).toBe("An om a client may run");
    expect(exposed.mcp).toEqual({ mode: "long-lived" });
    expect(exposed.inputSchema).toMatchObject({ type: "object", required: ["token"] });
    expect(exposed.unavailable).toBeUndefined();
  });

  test("derives the run folder name without running the om", () => {
    const exposed = set.oms.find((o) => o.name === "exposed")!;
    // `<name>-<hash8>` — the same rule ExecutionTree applies, so
    // `omkit://runs/<folderName>/latest/…` resolves for a run nobody has started yet.
    expect(exposed.folderName).toMatch(/^exposed-[0-9a-f]{8}$/);
    expect(exposed.file).toMatch(/exposed\.ts$/);
  });

  test("an om with no .mcp() still registers — filtering is the server's job", () => {
    expect(set.oms.find((o) => o.name === "hidden")!.mcp).toBeUndefined();
  });

  test("a file that throws on import becomes a warning, and its earlier om survives", () => {
    expect(set.oms.map((o) => o.name)).toContain("registers-then-throws");
    expect(set.warnings.some((w) => w.includes("explodes at import"))).toBe(true);
    // …and every other file still registered.
    expect(set.oms.map((o) => o.name)).toContain("exposed");
    expect(set.actions.map((a) => a.name)).toContain("seed");
  });

  test("reads exported actions with their export name and schema", () => {
    const seed = set.actions.find((a) => a.name === "seed")!;
    expect(seed.exportName).toBe("seed");
    expect(seed.summary).toBe("Seed the database");
    expect(seed.mcp).toEqual({ mode: "settling" });
    expect(seed.inputSchema).toMatchObject({ type: "object" });
    expect(set.actions.map((a) => a.name)).not.toContain("impostor");
  });

  test("an unconvertible schema marks one entry unavailable and leaves the rest listed", () => {
    const at = set.actions.find((a) => a.name === "at")!;
    expect(at.inputSchema).toBeUndefined();
    expect(typeof at.unavailable).toBe("string");
    expect(set.actions.find((a) => a.name === "seed")!.unavailable).toBeUndefined();
  });

  test("an empty file list resolves empty rather than forking or hanging", async () => {
    await expect(readRegistrations([])).resolves.toEqual({ oms: [], actions: [], warnings: [] });
  });
});
