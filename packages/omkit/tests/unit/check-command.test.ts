import { describe, expect, test } from "vitest";
import { checkReport } from "../../src/cli/commands/check.ts";

describe("checkReport", () => {
  test("clean project → code 0, a success title, no items", () => {
    const { title, items, code } = checkReport([]);
    expect(code).toBe(0);
    expect(title.toLowerCase()).toContain("no type errors");
    expect(items).toEqual([]);
  });

  test("errors → code 1 and each diagnostic as an item", () => {
    const { title, items, code } = checkReport([
      {
        file: "/p/actions/broken.ts",
        line: 4,
        message: "Type 'string' is not assignable to type 'number'.",
      },
    ]);
    expect(code).toBe(1);
    expect(title).toContain("1 type error");
    expect(items[0].head).toBe("broken.ts:4");
    expect(items[0].detail).toContain("not assignable");
  });
});
