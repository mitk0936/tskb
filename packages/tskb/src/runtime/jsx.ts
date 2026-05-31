/**
 * Semantic relation tag for TSKB knowledge graph
 *
 * Usage: <Relation from="a" to="b" />
 *
 * These props are extracted by the TSKB pipeline and converted to graph edges.
 */
import type {
  FolderName,
  ModuleName,
  TermName,
  ExportName,
  FileName,
  ExternalName,
} from "./registry.js";

type AnyNodeName = FolderName | ModuleName | TermName | ExportName | FileName | ExternalName;

/** Union of node name types used in ref props (Relation, Step). */
export type AnyNodeRef = (typeof ref & { __tskbType?: AnyNodeName }) | AnyNodeName;

/**
 * Type-safe semantic relation tag for TSKB knowledge graph
 *
 * Usage:
 *   <Relation from={ref as tskb.Modules['MyModule']} to={ref as tskb.Terms['MyTerm']} />
 *   <Relation from={ref as tskb.Folders['MyFolder']} to={ref as tskb.Modules['MyModule']} />
 *
 * These props are extracted by the TSKB pipeline and converted to graph edges.
 */
export function Relation({
  from,
  to,
  label,
}: {
  from: AnyNodeRef;
  to: AnyNodeRef;
  label?: string;
}): any {
  return { __tskbRelation: true, from, to, label };
}
/**
 * tskb ReactNode type - pure documentation node types without React dependency
 *
 * Supports:
 * - Primitives: string, number, boolean, null, undefined
 * - Arrays of nodes
 * - Ref assertions: objects with desc and either path or type properties
 */
export type ReactNode =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReactNode[]
  | { desc: string; path: string } // Folder ref
  | { desc: string; type: unknown } // Module/Export ref
  | { desc: string; [key: string]: string }; // External ref

/* ============================================================
 * Reference Helper
 * ============================================================
 *
 * Used with type assertions for type-safe, Shift+F12 trackable references:
 *
 *   {ref as tskb.Folders['MyFolder']}
 *   {ref as tskb.Modules['MyModule']}
 *   {ref as tskb.Terms['MyTerm']}
 *   {ref as tskb.Exports['MyExport']}
 */

export const ref: ReactNode = Symbol("tskb.ref") as any;

/* ============================================================
 * Value Helper
 * ============================================================
 *
 * Used with type assertions to inline a string-literal value from a type
 * into doc prose. The extractor resolves the asserted type via the
 * TypeScript checker and emits the literal string. Only single string
 * literals are supported — for a union, narrow with `Extract<U, "x">`.
 *
 *   const BinName = val as keyof typeof pkg.bin;                  // → "tskb"
 *   const Essential = val as Extract<DocPriority, "essential">;   // → "essential"
 *   const BuildCmd = val as typeof pkg.scripts.build;             // → "tsc -p ."
 */

export const val: string = Symbol("tskb.val") as any;

/* ============================================================
 * Path Helper
 * ============================================================
 *
 * Type-level utility for citing a deep key path in any TS shape — JSON
 * imports, interfaces, `as const` objects, anything with a known
 * key structure. Each segment is validated against `keyof` at its
 * level, so a typo or restructure fails the build.
 *
 *   type Pkg = typeof import("./package.json");
 *   const BuildScriptPath = val as DotPath<Pkg, ["scripts", "build"]>;
 *   // → "scripts.build"
 *
 *   interface AppConfig { system?: { server: { host: string } } }
 *   const HostPath = val as DotPath<AppConfig, ["system", "server", "host"]>;
 *   // → "system.server.host"  (optional segments are walked transparently)
 *
 * Optional / nullable segments are unwrapped via `NonNullable` at each
 * level, so `foo?: { bar: string }` still resolves to `"foo.bar"`.
 *
 * Resolves to `InvalidDotPath<...>` if any segment isn't a key of the
 * current type at that level — the assertion site then fails to type-check.
 */
/**
 * Brand type returned by {@link DotPath} when a tuple segment isn't a key of
 * the current type at that level. Because this is an object type, asserting
 * `val as InvalidDotPath<...>` triggers a TypeScript error ("Conversion of
 * type 'string' to type '...' may be a mistake") — a typo can't compile
 * silently the way `never` would.
 */
export interface InvalidDotPath<Got extends string, Expected> {
  readonly __dotPathError: "Invalid key";
  readonly got: Got;
  readonly expected: Expected;
}

export type DotPath<T, P extends readonly string[]> = P extends readonly [
  infer Head extends string,
  ...infer Tail extends readonly string[],
]
  ? Head extends keyof NonNullable<T>
    ? Tail extends readonly []
      ? Head
      : DotPath<NonNullable<T>[Head], Tail> extends infer Rest
        ? Rest extends string
          ? `${Head}.${Rest}`
          : Rest
        : never
    : InvalidDotPath<Head, keyof NonNullable<T> & string>
  : InvalidDotPath<"", never>;

/**
 * Importance level for documentation.
 * - "essential": included in generated skill/instructions files
 * - "constraint": architectural constraint — rules and invariants that MUST be followed when working on related modules/folders
 * - "supplementary": graph-only, queryable via search/pick but not in generated files
 */
export type DocPriority = "essential" | "constraint" | "supplementary";

/**
 * Documentation container - just renders children
 */
export function Doc({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  explains,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  priority,
  children,
}: {
  explains: string;
  priority?: DocPriority;
  children: any;
}): any {
  return children;
}

/* ============================================================
 * Helper components for structured content
 * ============================================================
 *
 * These components add semantic HTML markers to preserve document
 * structure in the extracted content. The tags are kept in the JSON
 * output for AI/tooling but stripped in visualizations for clarity.
 */

export function H1({ children }: { children: any }): any {
  return `<h1>${children}</h1>`;
}

export function H2({ children }: { children: any }): any {
  return `<h2>${children}</h2>`;
}

export function H3({ children }: { children: any }): any {
  return `<h3>${children}</h3>`;
}

export function P({ children }: { children: any }): any {
  return `<p>${children}</p>`;
}

export function List({ children }: { children: any }): any {
  return `<ul>${children}</ul>`;
}

export function Li({ children }: { children: any }): any {
  return `<li>${children}</li>`;
}

/**
 * Code snippet component - embeds executable code for documentation
 *
 * Usage:
 *   <Snippet code={() => {
 *     const result = someFunction();
 *     return result;
 *   }} />
 *
 * The function is converted to a string and stored in the knowledge graph.
 */
export function Snippet({ code }: { code: () => unknown }): any {
  const codeString = code.toString();
  return `<snippet>${codeString}</snippet>`;
}

/**
 * Architecture Decision Record component
 *
 * Usage:
 *   <Adr
 *     id="001"
 *     title="Use React for UI layer"
 *     status="accepted"
 *     date="2024-01-15"
 *     deciders="Tech Team"
 *   >
 *     <H2>Context</H2>
 *     <P>We need a UI framework...</P>
 *
 *     <H2>Decision</H2>
 *     <P>We will use React...</P>
 *
 *     <H2>Consequences</H2>
 *     <P>Positive: Large ecosystem...</P>
 *   </Adr>
 */
export function Adr({
  id,
  title,
  status,
  date,
  deciders,
  children,
}: {
  id: string;
  title: string;
  status: "proposed" | "accepted" | "deprecated" | "superseded";
  date?: string;
  deciders?: string;
  children: any;
}): any {
  const metadata = [
    `id="${id}"`,
    `title="${title}"`,
    `status="${status}"`,
    date ? `date="${date}"` : null,
    deciders ? `deciders="${deciders}"` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return `<adr ${metadata}>${children}</adr>`;
}

/**
 * Flow component — defines a named, ordered sequence of steps through the system.
 *
 * Flows become first-class nodes in the knowledge graph. Each <Step> child references
 * an existing node and describes its role in the flow. Children are validated at build
 * time: only <Step> elements are allowed inside <Flow>.
 *
 * Usage:
 *   <Flow name="login-flow" desc="User authentication from request to session token" priority="essential">
 *     <Step node={AuthController} label="Receives POST /auth/login" />
 *     <Step node={AuthService}    label="Validates credentials, generates JWT" />
 *   </Flow>
 */
export function Flow({
  name,
  desc,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  priority,
  children,
}: {
  name: string;
  desc: string;
  priority?: DocPriority;
  children: any;
}): any {
  return `<flow name="${name}" desc="${desc}">${children}</flow>`;
}

/**
 * Step component — a single participant in a Flow.
 *
 * The `node` prop references an existing registry node (via a ref constant).
 * The optional `label` describes what this node does in the context of the flow.
 *
 * Usage:
 *   <Step node={AuthService} label="Validates credentials" />
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Step({ node, label }: { node: AnyNodeRef; label?: string }): any {
  return `<step${label ? ` label="${label}"` : ""} />`;
}
