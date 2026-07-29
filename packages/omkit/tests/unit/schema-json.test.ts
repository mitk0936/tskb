import { describe, expect, test } from "vitest";
import { z } from "zod";
import { toJsonSchema } from "../../src/core/schema-json.ts";

describe("toJsonSchema", () => {
  test("converts an object with required and defaulted fields", () => {
    const schema = z.object({
      rows: z.number(),
      truncate: z.boolean().default(false),
    });
    const json = toJsonSchema(schema) as {
      type: string;
      properties: Record<string, { type: string }>;
      required?: string[];
    };

    expect(json.type).toBe("object");
    expect(json.properties.rows.type).toBe("number");
    expect(json.properties.truncate.type).toBe("boolean");
    expect(json.required).toEqual(["rows"]);
  });

  test("converts nested objects and arrays", () => {
    const schema = z.object({
      tags: z.array(z.string()),
      nested: z.object({ host: z.string() }),
    });
    const json = toJsonSchema(schema) as {
      properties: {
        tags: { type: string; items: { type: string } };
        nested: { type: string };
      };
    };

    expect(json.properties.tags.type).toBe("array");
    expect(json.properties.tags.items.type).toBe("string");
    expect(json.properties.nested.type).toBe("object");
  });

  test("is stable across calls for the same schema", () => {
    const schema = z.object({ a: z.string() });
    expect(JSON.stringify(toJsonSchema(schema))).toBe(JSON.stringify(toJsonSchema(schema)));
  });
});
