import { z } from "zod";

/** A JSON Schema document, kept deliberately loose — consumers read known keys. */
export type JsonSchema = Record<string, unknown>;

/**
 * Convert a zod schema to JSON Schema. The single conversion point in omkit: prompt
 * hints (`schema-hint.ts`) and any external consumer read the result, so the choice of
 * converter stays here rather than spreading across callers.
 *
 * Uses `io: "input"` to describe the input type where defaulted fields are optional,
 * correctly excluding them from `required` arrays at all nesting levels.
 */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: "input" }) as JsonSchema;
}
