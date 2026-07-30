import { readFileSync } from "node:fs";
import type { z } from "zod";
import { toJsonSchema, type JsonSchema } from "./schema-json.ts";
import { shapeHint } from "./schema-hint.ts";

/** Thrown when args cannot be resolved and nobody can be asked. */
export class MissingArgsError extends Error {
  /**
   * @param fields  Top-level field names that blocked resolution.
   * @param detail  Why, when at least one of them *was* supplied — a value that is present
   *   but wrong is not missing, and must not be reported as though it were absent.
   */
  constructor(
    readonly fields: string[],
    detail?: string
  ) {
    super(
      `could not resolve arg${fields.length === 1 ? "" : "s"}: ${fields.join(", ")} — ` +
        `pass them via OMKIT_ARGS, or run interactively` +
        (detail ? ` (${detail})` : "")
    );
    this.name = "MissingArgsError";
  }
}

/** What the caller must render to get one value from the user. */
export interface AskSpec {
  /** Dotted path of the field, e.g. `rows` or `config`. */
  readonly path: string;
  readonly kind: "scalar" | "json";
  /** One-line type sketch for the prompt. */
  readonly hint: string;
  /** The field's JSON Schema, for printing when the hint degrades. */
  readonly jsonSchema: JsonSchema;
}

export interface ResolveOptions {
  /** Values already supplied (from `OMKIT_ARGS`). */
  readonly supplied: unknown;
  /** False when there is no supervisor and stdin is not a TTY. */
  readonly interactive: boolean;
  readonly ask: (spec: AskSpec) => Promise<string>;
}

/** How many rounds of asking before resolution gives up. */
const MAX_ATTEMPTS = 3;

/**
 * Fill a schema's shape from supplied values, then defaults, then prompting — and fail if
 * that is not enough. Defaults need no work of their own: `safeParse` applies them, so a
 * defaulted field is never blocking and is never asked about.
 *
 * Interactivity is checked **before any prompting**: if nobody can be asked, every blocking
 * field is collected into a single error rather than asking for one and then discovering
 * the second is unanswerable.
 */
export async function resolveArgs(schema: z.ZodType, opts: ResolveOptions): Promise<unknown> {
  const root = toJsonSchema(schema);
  let current: Record<string, unknown> = asRecord(opts.supplied);

  for (let attempt = 0; ; attempt++) {
    const parsed = schema.safeParse(current);
    if (parsed.success) return parsed.data;

    const blocking = blockingFields(parsed.error);
    // Nothing nameable to ask for — the schema rejected the object as a whole (a top-level
    // refinement, or a schema that isn't an object at all). No question would make progress,
    // so fail now with the real reason instead of looping silently to the attempt cap.
    if (blocking.length === 0) throw new Error(`could not resolve args: ${message(parsed.error)}`);
    if (!opts.interactive) {
      const anySupplied = blocking.some((field) => current[field] !== undefined);
      throw new MissingArgsError(blocking, anySupplied ? message(parsed.error) : undefined);
    }
    if (attempt >= MAX_ATTEMPTS) {
      throw new Error(
        `could not resolve args after ${MAX_ATTEMPTS} attempts: ${message(parsed.error)}`
      );
    }

    for (const field of blocking) {
      const fieldSchema = propertySchema(root, field);
      const kind = isComplex(fieldSchema) ? "json" : "scalar";
      const answer = await opts.ask({
        path: field,
        kind,
        hint: shapeHint(fieldSchema),
        jsonSchema: fieldSchema,
      });
      // An empty answer is *no answer*, not a value. The prompt battery resolves an empty
      // line (and a timeout) to its default (""), and `Number("")` is 0 — so coercing here
      // would silently turn a bare Enter on a required number into a real zero. Leave the
      // field as it was and let the loop re-ask.
      if (answer.trim() === "") continue;
      current = { ...current, [field]: coerce(answer, fieldSchema, kind) };
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? { ...(value as object) } : {};
}

/**
 * The top-level field names the error blames, first-seen order, deduplicated. Both an
 * absent field and a present-but-wrong one block resolution and are asked about the same
 * way, so they are one list — whether a field was supplied is read off `current`, which
 * is the direct observation, rather than inferred from zod's issue shape.
 */
function blockingFields(error: z.ZodError): string[] {
  const names = error.issues.map((i) => String(i.path[0] ?? "")).filter((n) => n !== "");
  return [...new Set(names)];
}

function message(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"} — ${i.message}`).join("; ");
}

function propertySchema(root: JsonSchema, field: string): JsonSchema {
  const properties = root.properties;
  if (typeof properties === "object" && properties !== null) {
    const found = (properties as Record<string, unknown>)[field];
    if (typeof found === "object" && found !== null) return found as JsonSchema;
  }
  return {};
}

function isComplex(schema: JsonSchema): boolean {
  return schema.type === "object" || schema.type === "array";
}

/**
 * Turn a prompt answer into a value the schema can accept. Scalars coerce from their
 * string form; complex fields parse as JSON, or are read from a file path when the answer
 * does not start with `{` or `[` — pointing at a file beats pasting a large config.
 */
function coerce(answer: string, schema: JsonSchema, kind: "scalar" | "json"): unknown {
  const text = answer.trim();
  if (kind === "json") {
    try {
      return JSON.parse(text.startsWith("{") || text.startsWith("[") ? text : readFileArg(text));
    } catch {
      // Unparseable JSON *or* an unreadable path: hand the raw text back so the schema
      // rejects it and the loop re-asks, naming the field. A mistyped filename must not
      // escape as an ENOENT and take the whole run down.
      return text;
    }
  }
  if (schema.type === "number" || schema.type === "integer") {
    const n = Number(text);
    return Number.isNaN(n) ? text : n;
  }
  if (schema.type === "boolean") {
    if (/^(true|yes|y|1)$/i.test(text)) return true;
    if (/^(false|no|n|0)$/i.test(text)) return false;
    return text;
  }
  return text;
}

/** Read a JSON file named by an answer; a leading `@` is optional sugar. */
function readFileArg(pathish: string): string {
  return readFileSync(pathish.replace(/^@/, ""), "utf8");
}
