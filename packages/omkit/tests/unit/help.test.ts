import { describe, expect, test } from "vitest";
import { parseCli } from "../../src/cli/index.ts";
import { helpText } from "../../src/cli/commands/help.ts";

describe("help — parsing", () => {
  test("--help sets the help flag", () => {
    expect(parseCli(["--help"]).help).toBe(true);
  });

  test("-h is the short alias for --help", () => {
    expect(parseCli(["-h"]).help).toBe(true);
  });

  test("the `help` command is carried on command, not the flag", () => {
    const p = parseCli(["help"]);
    expect(p.command).toBe("help");
    expect(p.help).toBe(false);
  });

  test("no help by default", () => {
    expect(parseCli(["run", "oms/dev.ts"]).help).toBe(false);
  });
});

describe("helpText", () => {
  const text = helpText();

  test("lists every command", () => {
    for (const cmd of ["run", "ls", "check", "init", "help"]) {
      expect(text).toContain(cmd);
    }
  });

  test("documents the global flags", () => {
    for (const flag of ["--tsconfig", "--json", "--inspect", "-h, --help"]) {
      expect(text).toContain(flag);
    }
  });
});
