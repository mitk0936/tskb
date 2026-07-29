import { describe, expect, test } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "../../src/core/schema-json.ts";
import { shapeHint } from "../../src/core/schema-hint.ts";

const hintFor = (schema: z.ZodType): string => shapeHint(toJsonSchema(schema));

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

  test("degrades to 'see schema' for a shape it cannot sketch", () => {
    expect(shapeHint({ not: "a shape it understands" })).toBe("see schema");
  });
});
