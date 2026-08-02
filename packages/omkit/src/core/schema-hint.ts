import type { JsonSchema } from "./schema-json.ts";

/**
 * Placeholder text for a schema that cannot be sketched, for the one-line prompts where
 * printing the raw JSON Schema instead would not fit. Callers do **not** detect degradation
 * by comparing against it — {@link shapeHint} returns `undefined` for that.
 */
export const OPAQUE = "see schema";

/**
 * Render a JSON Schema as a one-line type sketch for a prompt — `{ host: string,
 * port?: number }` — or `undefined` when it cannot express the shape (deep unions,
 * tuples, recursion).
 *
 * Deliberately partial, and **all-or-nothing**: an unsketchable type anywhere in the tree
 * degrades the whole sketch rather than leaving a placeholder inside an otherwise-valid
 * one. `{ mode: see schema }` reads as a field whose type is the string "see schema", which
 * is exactly the misleading output this is supposed to refuse to print. Degradation is
 * signalled by the return type so a caller cannot miss it by string-matching the wrong
 * shape of sentinel.
 */
export function shapeHint(schema: JsonSchema): string | undefined {
  return render(schema);
}

function render(node: unknown): string | undefined {
  if (typeof node !== "object" || node === null) return undefined;
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
      return renderArray(s);
    case "object":
      return renderObject(s);
    default:
      return undefined;
  }
}

/**
 * A tuple's `items` is absent (it uses `prefixItems`), and an opaque element type renders
 * to nothing — either way there is no element sketch, so there is no array sketch.
 * Propagating `undefined` here is what stops `see schema[]` being printed.
 */
function renderArray(s: JsonSchema): string | undefined {
  const items = render(s.items);
  return items === undefined ? undefined : `${items}[]`;
}

function renderObject(s: JsonSchema): string | undefined {
  const properties = s.properties;
  if (typeof properties !== "object" || properties === null) return undefined;
  const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
  const entries = Object.entries(properties as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  const fields: string[] = [];
  for (const [key, value] of entries) {
    const rendered = render(value);
    // One field we cannot sketch makes the whole line untrustworthy: the reader has no way
    // to tell the interpolated placeholder from a real type. Degrade the object instead, so
    // the caller falls back to printing the schema the user actually has to satisfy.
    if (rendered === undefined) return undefined;
    fields.push(`${key}${required.has(key) ? "" : "?"}: ${rendered}`);
  }
  return `{ ${fields.join(", ")} }`;
}
