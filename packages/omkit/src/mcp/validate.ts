/**
 * A shallow check of a tool call's `args` against the declared JSON Schema: required
 * fields present, top-level primitives the right type. Deliberately not a validator.
 *
 * The real schema is a zod object living in the om's own process; the server holds only
 * its JSON Schema projection. `resolveArgs` is what actually validates, fills defaults,
 * and — when something is still missing — prompts, which reaches the client as an
 * elicitation. This check exists so an obviously-wrong call fails immediately with a
 * message naming every problem, instead of spending a fork to find out.
 */
type JsonSchemaLike = Record<string, unknown> | undefined;

const typeName = (value: unknown): string =>
  Array.isArray(value) ? "array" : value === null ? "null" : typeof value;

/** True when `value` satisfies a JSON Schema `type` keyword. Unknown types always pass. */
function matches(type: string, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

/** Required fields the caller left out. `null` counts as supplied — and wrongly typed. */
function missingRequired(schema: Record<string, unknown>, args: Record<string, unknown>): string[] {
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  return required
    .filter((key) => args[key] === undefined)
    .map((key) => `missing required argument "${key}"`);
}

/** Supplied fields whose value contradicts the schema's `type` keyword. */
function wrongTypes(schema: Record<string, unknown>, args: Record<string, unknown>): string[] {
  const properties = (schema.properties ?? {}) as Record<string, { type?: unknown }>;
  const problems: string[] = [];
  for (const [key, definition] of Object.entries(properties)) {
    const value = args[key];
    if (value === undefined) continue;
    const type = definition?.type;
    if (typeof type !== "string") continue; // unions, $ref, anyOf — the child's problem
    if (!matches(type, value)) {
      problems.push(`argument "${key}" must be a ${type}, got ${typeName(value)}`);
    }
  }
  return problems;
}

/** Every problem found, in schema order. Empty means "worth spawning". */
export function checkArgs(schema: JsonSchemaLike, args: unknown): string[] {
  if (!schema) return [];
  if (typeof args !== "object" || args === null || Array.isArray(args)) {
    return ["arguments must be a JSON object"];
  }
  const supplied = args as Record<string, unknown>;
  return [...missingRequired(schema, supplied), ...wrongTypes(schema, supplied)];
}
