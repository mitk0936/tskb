import { describe, expect, test } from "vitest";
import path from "node:path";
import { formatRegistry } from "../../src/cli/commands/ls.ts";
import type { Registry, RegistrationSet } from "../../src/client/registry.ts";

const OM_FILE = path.resolve("/p/oms/dev.ts");
const ACTION_FILE = path.resolve("/p/actions/build.ts");

const registry: Registry = {
  oms: [
    { name: "tskb:dev", file: OM_FILE, line: 45 },
    { name: "tskb:build", file: path.resolve("/p/oms/build.ts"), line: 28 },
  ],
  actions: [
    {
      name: "buildDocs",
      file: ACTION_FILE,
      exportName: "buildDocs",
      publishesCapability: true,
      events: true,
    },
  ],
  warnings: [],
};

const registrations: RegistrationSet = {
  oms: [
    {
      name: "tskb:dev",
      file: OM_FILE,
      folderName: "tskb-dev-bfcaf24d",
      summary: "Bring up the tskb dev stack.",
      mcp: { mode: "long-lived" },
    },
    {
      name: "tskb:build",
      file: path.resolve("/p/oms/build.ts"),
      folderName: "tskb-build-7af78236",
      summary: "Rebuild the graph.",
      mcp: { mode: "settling" },
    },
  ],
  actions: [{ name: "buildDocs", file: ACTION_FILE, exportName: "buildDocs" }],
  warnings: [],
};

describe("formatRegistry --describe", () => {
  test("shows each summary on its own indented line", () => {
    const out = formatRegistry(registry, { registrations });
    expect(out).toContain("    Bring up the tskb dev stack.");
    expect(out).toContain("    Rebuild the graph.");
  });

  test("marks exposure and mode", () => {
    const out = formatRegistry(registry, { registrations });
    expect(out).toContain("tskb:dev  dev.ts:45  [mcp, long-lived]");
    expect(out).toContain("tskb:build  build.ts:28  [mcp]");
  });

  test("leaves an unexposed action's existing markers alone", () => {
    const out = formatRegistry(registry, { registrations });
    expect(out).toContain("buildDocs  build.ts  [ref, events]");
  });

  test("adds mcp alongside the existing action markers when exposed", () => {
    const out = formatRegistry(registry, {
      registrations: {
        ...registrations,
        actions: [
          {
            name: "buildDocs",
            file: ACTION_FILE,
            exportName: "buildDocs",
            mcp: { mode: "settling" },
          },
        ],
      },
    });
    expect(out).toContain("buildDocs  build.ts  [ref, events, mcp]");
  });

  test("adds no continuation line for an om with no summary", () => {
    const out = formatRegistry(registry, {
      registrations: {
        ...registrations,
        oms: [{ name: "tskb:dev", file: OM_FILE, folderName: "f", mcp: { mode: "settling" } }],
      },
    });
    const dev = out.split("\n").findIndex((l) => l.includes("tskb:dev"));
    expect(out.split("\n")[dev + 1]).not.toMatch(/^ {4}\S/);
  });

  test("does not match a same-named om defined in a different file", () => {
    const out = formatRegistry(registry, {
      registrations: {
        ...registrations,
        oms: [
          {
            name: "tskb:dev",
            file: path.resolve("/elsewhere/dev.ts"),
            folderName: "f",
            summary: "wrong one",
            mcp: { mode: "settling" },
          },
        ],
      },
    });
    expect(out).not.toContain("wrong one");
  });

  test("output is byte-identical to plain ls when no registrations are given", () => {
    expect(formatRegistry(registry)).toBe(formatRegistry(registry, {}));
    expect(formatRegistry(registry)).not.toContain("[mcp");
    expect(formatRegistry(registry)).not.toContain("Rebuild the graph.");
  });

  test("json mode merges the declarations", () => {
    const parsed = JSON.parse(formatRegistry(registry, { json: true, registrations })) as {
      oms: { summary?: string }[];
    };
    expect(parsed.oms[0]!.summary).toBe("Bring up the tskb dev stack.");
  });
});
