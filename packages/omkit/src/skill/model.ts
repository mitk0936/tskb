import path from "node:path";
import { createHash } from "node:crypto";
import { shapeHint } from "../core/schema-hint.ts";
import { DEFAULT_TSCONFIG } from "../client/types.ts";
import type { McpMode } from "../core/types.ts";
import type { JsonSchema } from "../core/schema-json.ts";
import type {
  ActionRegistration,
  OmCall,
  OmRegistration,
  Registration,
  RegistrationSet,
  Registry,
} from "../client/registry.ts";

/** One step in a rendered outline. Structurally an {@link OmCall}; named for the skill's vocabulary. */
export type SkillCall = OmCall;

/** One runnable thing the generated skill documents. */
export interface SkillEntry {
  readonly kind: "om" | "action";
  readonly name: string;
  /** Project-relative, forward slashes on every platform — so the file does not churn per-OS. */
  readonly file: string;
  readonly mode: McpMode;
  /** The `.describe({ summary })` line. Absent when the author wrote none; never invented. */
  readonly summary?: string;
  /** A one-line sketch of the declared args, from {@link shapeHint}. */
  readonly argHint?: string;
  /** The raw schema, present only when `shapeHint` could not sketch it (per C7). */
  readonly argSchema?: JsonSchema;
  /** A concrete, complete `OMKIT_ARGS` value. Absent when no honest one can be built. */
  readonly argExample?: Record<string, unknown>;
  /** The static outline of the body. Absent when the walk found nothing recognisable. */
  readonly calls?: readonly SkillCall[];
  /** Why this entry cannot be called — carried through from discovery, rendered as a warning. */
  readonly unavailable?: string;
  /** Actions only: the exported binding a host om imports. */
  readonly exportName?: string;
  /** Actions only: true when the chain includes `.ref<…>()`, so it publishes a capability. */
  readonly publishesCapability?: boolean;
}

/** The project the skill describes: where its reader stands, and what config omkit was given. */
export interface SkillProject {
  /** Directory the file is written for — `.claude/` lives here, and paths are relative to it. */
  readonly root: string;
  /** Absolute path of the tsconfig discovery ran against, when the caller knows it. */
  readonly tsconfig?: string;
}

/** Everything the renderer needs, plus the hash that detects drift against it. */
export interface SkillModel {
  readonly oms: readonly SkillEntry[];
  readonly actions: readonly SkillEntry[];
  /**
   * The `--tsconfig` value every rendered command needs, relative to the root. Absent when the
   * CLI's own default already finds it — the flag would then be noise on every line.
   */
  readonly tsconfig?: string;
  /** First 8 hex of sha256 over the registry data below — never over the rendered markdown. */
  readonly hash: string;
}

/**
 * Fold a project's registrations and its AST scan into the model the skill renders from.
 *
 * The two inputs answer different halves: the fork knows summaries, modes, and arg schemas
 * (values that only exist once a module has been evaluated), while the AST scan knows the
 * body outline and whether an action publishes a capability. Neither alone is enough.
 *
 * Only `.mcp()`-marked entries survive — exposure is opt-in, exactly as it is for the MCP
 * server, so generating a skill can never widen what an assistant will attempt.
 */
export function buildSkillModel(
  registrations: RegistrationSet,
  registry: Registry,
  project: SkillProject
): SkillModel {
  const { root } = project;
  const outlines = new Map(registry.oms.map((o) => [key(o.name, o.file), o.calls] as const));
  const capabilities = new Map(
    registry.actions.map((a) => [key(a.name, a.file), a.publishesCapability] as const)
  );

  const oms = registrations.oms
    .filter(isExposed)
    .map((om) => omEntry(om, outlines.get(key(om.name, om.file)), root))
    .sort(byName);
  const actions = registrations.actions
    .filter(isExposed)
    .map((a) => actionEntry(a, capabilities.get(key(a.name, a.file)), root))
    .sort(byName);

  const tsconfig = tsconfigFlag(project);
  return {
    oms,
    actions,
    ...(tsconfig ? { tsconfig } : {}),
    hash: registryHash([...oms, ...actions], tsconfig),
  };
}

/**
 * What a reader standing at the root must pass as `--tsconfig`, or `undefined` when they need
 * pass nothing. omkit looks for `tsconfig.omkit.json` in the working directory, so a project
 * whose config sits anywhere else — the common case once an om project lives in a subfolder —
 * has commands that only work with the flag. Rendering it is the difference between a file
 * that documents how to run this project and one that documents how to run some other project.
 */
function tsconfigFlag({ root, tsconfig }: SkillProject): string | undefined {
  if (tsconfig === undefined) return undefined;
  const rel = relative(tsconfig, root);
  return rel === DEFAULT_TSCONFIG ? undefined : rel;
}

function isExposed(r: Registration): boolean {
  return r.mcp !== undefined;
}

/** Identity for cross-referencing the two discovery passes: an om is its name in its file. */
function key(name: string, file: string): string {
  return `${name}\0${path.resolve(file)}`;
}

/** Alphabetical by name, then by file — so two same-named oms in different files stay ordered. */
function byName(a: SkillEntry, b: SkillEntry): number {
  return a.name.localeCompare(b.name) || a.file.localeCompare(b.file);
}

function omEntry(
  om: OmRegistration,
  calls: readonly OmCall[] | undefined,
  root: string
): SkillEntry {
  return {
    kind: "om",
    name: om.name,
    file: relative(om.file, root),
    mode: om.mcp?.mode ?? "settling",
    ...describeArgs(om.inputSchema),
    ...(om.summary ? { summary: om.summary } : {}),
    ...(calls?.length ? { calls } : {}),
    ...(om.unavailable ? { unavailable: om.unavailable } : {}),
  };
}

function actionEntry(
  action: ActionRegistration,
  publishesCapability: boolean | undefined,
  root: string
): SkillEntry {
  return {
    kind: "action",
    name: action.name,
    file: relative(action.file, root),
    mode: action.mcp?.mode ?? "settling",
    exportName: action.exportName,
    ...(publishesCapability ? { publishesCapability: true } : {}),
    ...describeArgs(action.inputSchema),
    ...(action.summary ? { summary: action.summary } : {}),
    ...(action.unavailable ? { unavailable: action.unavailable } : {}),
  };
}

/**
 * Sketch a schema, falling back to the schema itself. `shapeHint` is all-or-nothing by design,
 * so a `undefined` return means the shape would have been misleading — the honest answer then
 * is the raw JSON Schema the caller actually has to satisfy, not a partial sketch.
 *
 * The example is built from the schema alongside it, and deliberately not from the sketch:
 * reading a value back out of rendered prose only works for the shapes the prose happens to
 * be shaped like — an enum field, whose sketch is `"a" | "b"` rather than `name: type`, is
 * exactly the case that silently produced an empty example.
 */
type ArgFields = Pick<SkillEntry, "argHint" | "argSchema" | "argExample">;

function describeArgs(schema: JsonSchema | undefined): ArgFields {
  if (!schema) return {};
  const hint = shapeHint(schema);
  const example = argExample(schema);
  return {
    ...(hint === undefined ? { argSchema: schema } : { argHint: hint }),
    ...(example ? { argExample: example } : {}),
  };
}

/**
 * A complete, valid `OMKIT_ARGS` object for this schema, or `undefined` when one cannot be
 * built honestly.
 *
 * "Complete" is the whole point: an example missing a required field does not demonstrate the
 * call, it demonstrates the prompt the reader gets instead. So every required field must be
 * sampleable or there is no example — and when nothing is required, one optional field is
 * enough to show the shape without implying the rest are needed.
 */
function argExample(schema: JsonSchema): Record<string, unknown> | undefined {
  const properties = schema.properties;
  if (typeof properties !== "object" || properties === null) return undefined;
  const entries = Object.entries(properties as Record<string, JsonSchema>);
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);

  const mandatory = entries.filter(([key]) => required.has(key));
  if (mandatory.length > 0) {
    const example: Record<string, unknown> = {};
    for (const [key, field] of mandatory) {
      const value = sample(field);
      if (value === undefined) return undefined;
      example[key] = value;
    }
    return example;
  }

  for (const [key, field] of entries) {
    const value = sample(field);
    if (value !== undefined) return { [key]: value };
  }
  return undefined;
}

/**
 * One plausible value for a field, or `undefined` when the type has no short literal form.
 * A declared default wins over an invented value — it is both valid and the author's own
 * choice, which reads better in an example than a zero or an ellipsis.
 */
function sample(field: JsonSchema): unknown {
  if (typeof field !== "object" || field === null) return undefined;
  const enumValues = field.enum;
  if (Array.isArray(enumValues) && enumValues.length > 0) return enumValues[0];
  if (field.default !== undefined) return field.default;
  switch (field.type) {
    case "string":
      return "…";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    // Objects and arrays have no one-line stand-in: `{}` and `[]` are as likely to be rejected
    // by the schema as accepted by it, and a rejected example is worse than none.
    default:
      return undefined;
  }
}

/** Project-relative with forward slashes; absolute only if the file lies outside the root. */
function relative(file: string, root: string): string {
  const rel = path.relative(root, file);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return posix(file);
  return posix(rel);
}

const posix = (p: string): string => p.split(path.sep).join("/").split("\\").join("/");

/**
 * The staleness hash: first 8 hex of sha256 over the registry data, deliberately **not** over
 * the rendered markdown, so reformatting the file does not read as drift.
 *
 * The outline is included even though the spec's list of inputs predates it: an edited om body
 * changes what the file claims the run does, and leaving that undetected is exactly the silent
 * drift the hash exists to catch. Keys are sorted before hashing so a schema serialised in a
 * different property order cannot masquerade as a change.
 */
export function registryHash(entries: readonly SkillEntry[], tsconfig?: string): string {
  const declarations = entries.map((e) => [
    e.kind,
    e.name,
    e.file,
    e.mode,
    e.summary ?? "",
    e.exportName ?? "",
    e.unavailable ?? "",
    e.publishesCapability === true,
    e.argSchema ?? e.argHint ?? "",
    (e.calls ?? []).map((c) => [c.name, c.tag ?? ""]),
  ]);
  // The invocation is hashed beside the declarations because it is part of what the file
  // claims: move a project's tsconfig and every command in it becomes wrong, while not one
  // om has changed. Drift is "the file no longer describes this project", not "an om changed".
  const material = [declarations, tsconfig ?? ""];
  return createHash("sha256").update(canonical(material)).digest("hex").slice(0, 8);
}

/** JSON with object keys sorted at every depth, so key order can never change the hash. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}
