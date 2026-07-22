import { describe, expect, test } from "vitest";
import { formatDiagnostics } from "../../src/cli/commands/check.ts";

describe("formatDiagnostics", () => {
  test("clean project → code 0 and a success line", () => {
    const { text, code } = formatDiagnostics([]);
    expect(code).toBe(0);
    expect(text.toLowerCase()).toContain("no type errors");
  });

  test("errors → code 1 and each diagnostic listed", () => {
    const { text, code } = formatDiagnostics([
      {
        file: "/p/actions/broken.ts",
        line: 4,
        message: "Type 'string' is not assignable to type 'number'.",
      },
    ]);
    expect(code).toBe(1);
    expect(text).toContain("broken.ts:4");
    expect(text).toContain("not assignable");
  });
});
