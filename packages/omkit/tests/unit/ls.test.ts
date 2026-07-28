import { describe, expect, test } from "vitest";
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
});
