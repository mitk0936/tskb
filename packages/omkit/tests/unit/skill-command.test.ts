import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { skillCommand } from "../../src/cli/commands/skill.ts";
import { SKILL_RELATIVE_PATH, DEFAULT_DESCRIPTION } from "../../src/skill/file.ts";
import type { OmkitClient } from "../../src/client/index.ts";
import type { OmRegistration, RegistrationSet, Registry } from "../../src/client/registry.ts";

let root: string;
let file: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-skillcmd-"));
  file = path.join(root, SKILL_RELATIVE_PATH);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

/** A client whose only real behaviour is the registration set under test. */
function fakeClient(set: Partial<RegistrationSet>): OmkitClient {
  const registry: Registry = set.registry ?? { oms: [], actions: [], warnings: [] };
  const full: RegistrationSet = {
    oms: [],
    actions: [],
    warnings: [],
    ...set,
    registry,
  };
  return {
    tsconfig: path.join(root, "tsconfig.omkit.json"),
    discover: () => Promise.resolve(registry),
    discoverRegistrations: () => Promise.resolve(full),
    run: () => {
      throw new Error("not used");
    },
    runBare: () => Promise.resolve(0),
    check: () => Promise.resolve([]),
  };
}

const om = (over: Partial<OmRegistration> = {}): OmRegistration => ({
  name: "tskb:build",
  file: path.join(root, "om/build.ts"),
  folderName: "tskb-build-abcd1234",
  mcp: { mode: "settling" },
  ...over,
});

const read = (): string => fs.readFileSync(file, "utf8");

describe("skillCommand", () => {
  it("writes the skill where the project expects it", async () => {
    await skillCommand(fakeClient({ oms: [om({ summary: "Rebuild the graph." })] }), { root });
    expect(read()).toContain("### `tskb:build` — settling");
    expect(read()).toContain("Rebuild the graph.");
  });

  it("carries a subfolder config into the commands it writes", async () => {
    const client: OmkitClient = {
      ...fakeClient({ oms: [om()] }),
      tsconfig: path.join(root, "om", "tsconfig.omkit.json"),
    };
    await skillCommand(client, { root });
    expect(read()).toContain("npx omkit run tskb:build --tsconfig om/tsconfig.omkit.json");
  });

  it("omits an om the author did not expose", async () => {
    await skillCommand(fakeClient({ oms: [om({ name: "secret", mcp: undefined })] }), { root });
    expect(read()).not.toContain("secret");
  });

  it("gives a fresh file the fallback description", async () => {
    await skillCommand(fakeClient({ oms: [om()] }), { root });
    expect(read()).toContain(`description: ${DEFAULT_DESCRIPTION}`);
  });

  it("preserves an authored description across regeneration", async () => {
    await skillCommand(fakeClient({ oms: [om()] }), { root });
    fs.writeFileSync(file, read().replace(DEFAULT_DESCRIPTION, "Load me when deploying."), "utf8");

    await skillCommand(fakeClient({ oms: [om({ summary: "now described" })] }), { root });
    expect(read()).toContain("description: Load me when deploying.");
    expect(read()).toContain("now described");
  });

  it("regenerates byte-identically over an unchanged registry", async () => {
    await skillCommand(fakeClient({ oms: [om({ summary: "s" })] }), { root });
    const first = read();
    await skillCommand(fakeClient({ oms: [om({ summary: "s" })] }), { root });
    expect(read()).toBe(first);
  });

  it("honours --out", async () => {
    await skillCommand(fakeClient({ oms: [om()] }), { root, out: "docs/RUNS.md" });
    expect(fs.existsSync(path.join(root, "docs/RUNS.md"))).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("degrades an entry whose schema would not convert, rather than failing", async () => {
    await skillCommand(
      fakeClient({
        oms: [om({ unavailable: "its schema would not convert" }), om({ name: "fine" })],
      }),
      { root }
    );
    expect(read()).toContain("- **Not callable:** its schema would not convert");
    expect(read()).toContain("### `fine`");
  });
});

describe("skillCommand --check", () => {
  it("passes on a file it just wrote", async () => {
    await skillCommand(fakeClient({ oms: [om({ summary: "s" })] }), { root });
    await skillCommand(fakeClient({ oms: [om({ summary: "s" })] }), { root, check: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("fails once a summary changes", async () => {
    await skillCommand(fakeClient({ oms: [om({ summary: "old" })] }), { root });
    await skillCommand(fakeClient({ oms: [om({ summary: "new" })] }), { root, check: true });
    expect(process.exitCode).toBe(1);
  });

  it("fails once the outline changes", async () => {
    const withCalls = (calls: { name: string }[]): Partial<RegistrationSet> => ({
      oms: [om()],
      registry: {
        oms: [{ name: "tskb:build", file: path.join(root, "om/build.ts"), line: 1, calls }],
        actions: [],
        warnings: [],
      },
    });
    await skillCommand(fakeClient(withCalls([{ name: "watchDir" }])), { root });
    await skillCommand(fakeClient(withCalls([{ name: "command" }])), { root, check: true });
    expect(process.exitCode).toBe(1);
  });

  it("passes after a whitespace-only edit to the rendered body", async () => {
    await skillCommand(fakeClient({ oms: [om({ summary: "s" })] }), { root });
    fs.writeFileSync(file, `${read()}\n\n<!-- a human added a note -->\n`, "utf8");

    await skillCommand(fakeClient({ oms: [om({ summary: "s" })] }), { root, check: true });
    expect(process.exitCode).toBeUndefined();
  });

  it("treats a file with no marker as stale", async () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "---\ndescription: hand written\n---\n\n# mine\n", "utf8");

    await skillCommand(fakeClient({ oms: [om()] }), { root, check: true });
    expect(process.exitCode).toBe(1);
  });

  it("does not write while checking", async () => {
    await skillCommand(fakeClient({ oms: [om({ summary: "old" })] }), { root });
    const before = read();
    await skillCommand(fakeClient({ oms: [om({ summary: "new" })] }), { root, check: true });
    expect(read()).toBe(before);
  });
});
