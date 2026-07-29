import { z } from "zod";

/** A JSON Schema document, kept deliberately loose — consumers read known keys. */
export type JsonSchema = Record<string, unknown>;

/**
 * Convert a zod schema to JSON Schema. The single conversion point in omkit: prompt
 * hints (`schema-hint.ts`) and any external consumer read the result, so the choice of
 * converter stays here rather than spreading across callers.
 */
export function toJsonSchema(schema: z.ZodType): JsonSchema {
  const jsonSchema = z.toJSONSchema(schema) as JsonSchema;

  // Post-process to remove fields with defaults from required array.
  // Fields with defaults are optional from a user perspective, so they should not
  // appear in the required array of the JSON Schema.
  if (schema instanceof z.ZodObject && Array.isArray(jsonSchema.required)) {
    const shape = schema._def.shape;
    const fieldsWithDefaults = new Set<string>();

    for (const [key, field] of Object.entries(shape)) {
      // Check if this field is wrapped in ZodDefault (has _def.defaultValue)
      if (field instanceof z.ZodDefault) {
        fieldsWithDefaults.add(key);
      }
    }

    if (fieldsWithDefaults.size > 0) {
      jsonSchema.required = (jsonSchema.required as string[]).filter(
        (key) => !fieldsWithDefaults.has(key)
      );
    }
  }

  return jsonSchema;
}
