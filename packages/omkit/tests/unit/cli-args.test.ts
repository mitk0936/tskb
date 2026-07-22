import { describe, expect, test } from "vitest";
import { parseCli } from "../../src/cli/index.ts";

describe("parseCli", () => {
  test("parses a command, target, and flags", () => {
    const p = parseCli(["run", "oms/dev.ts", "--json"]);
    expect(p.command).toBe("run");
    expect(p.target).toBe("oms/dev.ts");
    expect(p.json).toBe(true);
  });

  test("defaults command to ui and tsconfig to tsconfig.omkit.json", () => {
    const p = parseCli([]);
    expect(p.command).toBe("ui");
    expect(p.tsconfig).toBe("tsconfig.omkit.json");
  });
});
