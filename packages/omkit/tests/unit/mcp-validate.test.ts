import { describe, expect, test } from "vitest";
import { checkArgs } from "../../src/mcp/validate.ts";

const schema = {
  type: "object",
  properties: {
    token: { type: "string" },
    rows: { type: "number" },
    headless: { type: "boolean" },
    tags: { type: "array" },
  },
  required: ["token", "rows"],
};

describe("checkArgs", () => {
  test("accepts a complete, correctly-typed object", () => {
    expect(checkArgs(schema, { token: "t", rows: 3, headless: true })).toEqual([]);
  });

  test("names every missing required field at once, not just the first", () => {
    expect(checkArgs(schema, {})).toEqual([
      'missing required argument "token"',
      'missing required argument "rows"',
    ]);
  });

  test("reports a wrong primitive type with both the expected and the actual", () => {
    expect(checkArgs(schema, { token: 1, rows: 3 })).toEqual([
      'argument "token" must be a string, got number',
    ]);
  });

  test("accepts an integer for a number and an array for an array", () => {
    expect(checkArgs(schema, { token: "t", rows: 3, tags: ["a"] })).toEqual([]);
  });

  test("ignores fields the schema does not describe rather than rejecting them", () => {
    // The declared schema is the child's to enforce; over-strictness here would reject
    // calls that `resolveArgs` would have accepted.
    expect(checkArgs(schema, { token: "t", rows: 1, extra: 9 })).toEqual([]);
  });

  test("a defaulted field is not required, so omitting it is fine", () => {
    expect(checkArgs(schema, { token: "t", rows: 1 })).toEqual([]);
  });

  test("no schema means nothing to check", () => {
    expect(checkArgs(undefined, { anything: true })).toEqual([]);
  });

  test("a non-object argument is rejected outright", () => {
    expect(checkArgs(schema, "nope")).toEqual(["arguments must be a JSON object"]);
  });

  test("a null value counts as supplied but wrongly typed, not as missing", () => {
    expect(checkArgs(schema, { token: null, rows: 1 })).toEqual([
      'argument "token" must be a string, got null',
    ]);
  });
});
