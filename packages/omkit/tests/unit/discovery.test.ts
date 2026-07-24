import { describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discover } from "../../src/cli/client/discovery.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const tsconfig = path.join(here, "../fixtures/discovery/tsconfig.omkit.json");

describe("discover", () => {
  test("finds runnable oms with names, files, and lines", () => {
    const { oms } = discover(tsconfig);
    const names = oms.map((o) => o.name).sort();
    expect(names).toEqual(["build", "dev"]);
    const dev = oms.find((o) => o.name === "dev")!;
    expect(path.basename(dev.file)).toBe("dev.ts");
    expect(dev.line).toBeGreaterThan(0);
  });

  test("finds inspectable actions with capability/events metadata", () => {
    const { actions } = discover(tsconfig);
    const build = actions.find((a) => a.name === "build")!;
    expect(build.exportName).toBe("build");
    expect(build.publishesCapability).toBe(true);
    expect(build.events).toBe(true);

    const lint = actions.find((a) => a.name === "lint")!;
    expect(lint.publishesCapability).toBe(false);
    expect(lint.events).toBe(false);
  });

  test("degrades gracefully: a type-broken file still yields its action, plus a warning", () => {
    const { actions, warnings } = discover(tsconfig);
    expect(actions.some((a) => a.name === "flaky")).toBe(true);
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("throws on a missing tsconfig (a fatal config problem, not a warning)", () => {
    expect(() => discover(path.join(here, "does-not-exist.json"))).toThrow(/could not read/);
  });

  test("finds an action imported by an om, discovered via a relative tsconfig path (regression)", () => {
    // The trigger: a relative tsconfig path makes `parsed.fileNames` relative while the action,
    // pulled in via the om's relative import, resolves to an absolute path — they must still
    // match. Run from the fixture dir so "tsconfig.omkit.json" is relative.
    const dir = path.join(here, "../fixtures/crossimport");
    const prev = process.cwd();
    try {
      process.chdir(dir);
      const reg = discover("tsconfig.omkit.json");
      expect(reg.oms.map((o) => o.name)).toContain("main");
      expect(reg.actions.map((a) => a.name)).toContain("thing");
    } finally {
      process.chdir(prev);
    }
  });
});
