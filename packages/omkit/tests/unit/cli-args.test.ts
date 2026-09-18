import { describe, expect, test } from "vitest";
import { parseCli } from "../../src/cli/index.ts";

describe("parseCli", () => {
  test("parses a command, target, and flags", () => {
    const p = parseCli(["run", "oms/dev.ts", "--json"]);
    expect(p.command).toBe("run");
    expect(p.target).toBe("oms/dev.ts");
    expect(p.json).toBe(true);
  });

  test("defaults command to run (no target → interactive) and tsconfig to tsconfig.omkit.json", () => {
    const p = parseCli([]);
    expect(p.command).toBe("run");
    expect(p.target).toBeUndefined();
    expect(p.tsconfig).toBe("tsconfig.omkit.json");
  });

  test("leaves the opt-in flags off unless asked", () => {
    const p = parseCli(["ls"]);
    expect(p.describe).toBe(false);
    expect(p.check).toBe(false);
    expect(p.out).toBeUndefined();
  });

  test("parses the skill command's flags", () => {
    const p = parseCli(["skill", "--check", "--out", "docs/SKILL.md"]);
    expect(p.command).toBe("skill");
    expect(p.check).toBe(true);
    expect(p.out).toBe("docs/SKILL.md");
  });

  test("parses ls --describe", () => {
    expect(parseCli(["ls", "--describe"]).describe).toBe(true);
  });
});
