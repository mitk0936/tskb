import type { JsonSchema } from "./schema-json.ts";

/** What we print when a schema is too gnarly to sketch (deep unions, recursion). */
const OPAQUE = "see schema";

/**
 * Render a JSON Schema as a one-line type sketch for a prompt — `{ host: string,
 * port?: number }`. Deliberately partial: anything it cannot express degrades to
 * {@link OPAQUE} rather than printing something misleading.
 */
export function shapeHint(schema: JsonSchema): string {
  return render(schema);
}

function render(node: unknown): string {
  if (typeof node !== "object" || node === null) return OPAQUE;
  const s = node as JsonSchema;

  const enumValues = s.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    return enumValues.map((v) => JSON.stringify(v)).join(" | ");
  }

  switch (s.type) {
    case "string":
    case "number":
    case "integer":
    case "boolean":
    case "null":
      return String(s.type);
    case "array":
      if (typeof s.items !== "object" || s.items === null) return OPAQUE;
      return `${render(s.items)}[]`;
    case "object":
      return renderObject(s);
    default:
      return OPAQUE;
  }
}

function renderObject(s: JsonSchema): string {
  const properties = s.properties;
  if (typeof properties !== "object" || properties === null) return OPAQUE;
  const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  const entries = Object.entries(properties as Record<string, unknown>);
  if (entries.length === 0) return OPAQUE;
  const fields = entries.map(([key, value]) => {
    const optional = required.has(key) ? "" : "?";
    return `${key}${optional}: ${render(value)}`;
  });
  return `{ ${fields.join(", ")} }`;
}
