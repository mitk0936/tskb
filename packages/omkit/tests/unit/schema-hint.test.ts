import { describe, expect, test } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "../../src/core/schema-json.ts";
import { shapeHint } from "../../src/core/schema-hint.ts";

const hintFor = (schema: z.ZodType): string | undefined => shapeHint(toJsonSchema(schema));

describe("shapeHint", () => {
  test("renders scalars", () => {
    expect(hintFor(z.string())).toBe("string");
    expect(hintFor(z.number())).toBe("number");
    expect(hintFor(z.boolean())).toBe("boolean");
  });

  test("renders an object with optional fields marked", () => {
    const hint = hintFor(z.object({ host: z.string(), port: z.number().optional() }));
    expect(hint).toBe("{ host: string, port?: number }");
  });

  test("renders arrays as type[]", () => {
    expect(hintFor(z.object({ tags: z.array(z.string()) }))).toBe("{ tags: string[] }");
  });

  test("renders enums as a union of quoted literals", () => {
    expect(hintFor(z.object({ mode: z.enum(["fast", "slow"]) }))).toBe('{ mode: "fast" | "slow" }');
  });

  test("degrades to undefined for a shape it cannot sketch", () => {
    expect(shapeHint({ not: "a shape it understands" })).toBeUndefined();
  });

  test("degrades tuple (bare) to undefined", () => {
    expect(hintFor(z.tuple([z.string(), z.number()]))).toBeUndefined();
  });

  // Degradation is all-or-nothing, and these are the cases that prove it. A partial sketch
  // interpolates the placeholder into an otherwise-valid line — `{ pair: see schema }` — which
  // reads as a field whose type is literally "see schema", and which no caller can tell apart
  // from a real sketch without string-matching. One unsketchable descendant, at any depth,
  // must take the whole line with it.
  test("an unsketchable field degrades the object around it", () => {
    expect(hintFor(z.object({ pair: z.tuple([z.string(), z.number()]) }))).toBeUndefined();
  });

  test("an unsketchable type nested two levels down degrades the whole sketch", () => {
    const schema = z.object({ config: z.object({ mode: z.union([z.string(), z.number()]) }) });
    expect(hintFor(schema)).toBeUndefined();
    // …and the field's own sub-schema, which is what `resolveArgs` actually asks about.
    const config = (toJsonSchema(schema).properties as Record<string, never>).config;
    expect(shapeHint(config)).toBeUndefined();
  });

  test("an unsketchable element degrades the array around it", () => {
    expect(hintFor(z.object({ pairs: z.array(z.tuple([z.string()])) }))).toBeUndefined();
  });

  test("a sketchable neighbour does not rescue an unsketchable sibling", () => {
    const schema = z.object({ host: z.string(), when: z.union([z.string(), z.number()]) });
    expect(hintFor(schema)).toBeUndefined();
  });
});
