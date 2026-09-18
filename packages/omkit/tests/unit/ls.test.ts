import { describe, expect, test } from "vitest";
import path from "node:path";
import { formatRegistry } from "../../src/cli/commands/ls.ts";
import type { Registry } from "../../src/client/registry.ts";

const registry: Registry = {
  oms: [{ name: "dev", file: "/p/oms/dev.ts", line: 3 }],
  actions: [
    {
      name: "build",
      file: "/p/actions/build.ts",
      exportName: "build",
      publishesCapability: true,
      events: true,
    },
  ],
  warnings: ["broken.ts:4 Type 'string' is not assignable to type 'number'."],
};

describe("formatRegistry", () => {
  test("plain text lists oms, actions, and warnings", () => {
    const out = formatRegistry(registry);
    expect(out).toContain("dev");
    expect(out).toContain("build");
    expect(out).toContain("broken.ts:4");
  });

  test("json mode emits parseable JSON", () => {
    const out = formatRegistry(registry, { json: true });
    expect(JSON.parse(out).oms[0].name).toBe("dev");
  });

  describe("om order", () => {
    const ROOT = path.resolve("/proj");
    const at = (rel: string): string => path.join(ROOT, rel);
    const nested: Registry = {
      oms: [
        { name: "a-nightly", file: at("om/ci/nightly/a.ts"), line: 1 },
        { name: "z-top", file: at("z.ts"), line: 1 },
        { name: "b-build", file: at("om/build.ts"), line: 1 },
        { name: "a-build", file: at("om/a.ts"), line: 1 },
      ],
      actions: [],
      warnings: [],
    };
    const expected = ["z-top", "a-build", "b-build", "a-nightly"];

    test("plain text lists oms nearest the root first, then by name", () => {
      const out = formatRegistry(nested, { root: ROOT });
      const names = out
        .split("\n")
        .filter((l) => l.startsWith("  "))
        .map((l) => l.trim().split(/\s+/)[0]);
      expect(names).toEqual(expected);
    });

    test("json mode lists them in the same order", () => {
      const out = formatRegistry(nested, { json: true, root: ROOT });
      expect(JSON.parse(out).oms.map((o: { name: string }) => o.name)).toEqual(expected);
    });
  });
});
