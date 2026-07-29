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

  test("excludes nested defaults from required arrays at all levels", () => {
    const schema = z.object({
      outer: z.string(),
      nested: z.object({
        host: z.string(),
        port: z.number().default(8080),
      }),
      items: z.array(
        z.object({
          name: z.string(),
          count: z.number().default(0),
        })
      ),
    });
    const json = toJsonSchema(schema) as {
      required?: string[];
      properties: {
        nested: {
          required?: string[];
        };
        items: {
          items: {
            required?: string[];
          };
        };
      };
    };

    // Top-level required should exclude no defaults (outer and nested are both required)
    expect(json.required).toEqual(["outer", "nested", "items"]);

    // Nested object required should exclude port (has default)
    expect(json.properties.nested.required).toEqual(["host"]);

    // Array items required should exclude count (has default)
    expect(json.properties.items.items.required).toEqual(["name"]);
  });
});
