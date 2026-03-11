/**
 * Semantic relation tag for TSKB knowledge graph
 *
 * Usage: <Relation from="a" to="b" />
 *
 * These props are extracted by the TSKB pipeline and converted to graph edges.
 */
import type { FolderName, ModuleName, TermName, ExportName } from "./registry.js";

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
  from:
    | (typeof ref & { __tskbType?: FolderName | ModuleName | TermName | ExportName })
    | (FolderName | ModuleName | TermName | ExportName);
  to:
    | (typeof ref & { __tskbType?: FolderName | ModuleName | TermName | ExportName })
    | (FolderName | ModuleName | TermName | ExportName);
  label?: string;
}): any {
  // Return a special marker for extraction
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
  | { desc: string; type: unknown }; // Module/Export ref

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
  explains,
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
  return `<h1>${children}</h1>` as any;
}

export function H2({ children }: { children: any }): any {
  return `<h2>${children}</h2>` as any;
}

export function H3({ children }: { children: any }): any {
  return `<h3>${children}</h3>` as any;
}

export function P({ children }: { children: any }): any {
  return `<p>${children}</p>` as any;
}

export function List({ children }: { children: any }): any {
  return `<ul>${children}</ul>` as any;
}

export function Li({ children }: { children: any }): any {
  return `<li>${children}</li>` as any;
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
export function Snippet({ code }: { code: () => any }): any {
  const codeString = code.toString();
  return `<snippet>${codeString}</snippet>` as any;
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

  return `<adr ${metadata}>${children}</adr>` as any;
}
