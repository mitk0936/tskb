import type { JsonSchema } from "../core/schema-json.ts";

/** One step in an om's static outline: an imported call, with the tag authored on its chain. */
export interface OmCall {
  readonly name: string;
  /** The `.tag("…")` literal from the same fluent chain, when the author wrote one. */
  readonly tag?: string;
}

/** A runnable om discovered from a top-level `om("name", …)` call. */
export interface DiscoveredOm {
  /** The om's name — its first string argument. */
  readonly name: string;
  /** Absolute path of the file that defines it. */
  readonly file: string;
  /** 1-based line of the `om(...)` call (informational). */
  readonly line: number;
  /**
   * A static approximation of what the body calls, in source order. Absent when the walk
   * found nothing recognisable. Never a contract — see {@link import("./outline.ts").outlineBody}
   * for what it deliberately cannot see.
   */
  readonly calls?: readonly OmCall[];
}

/** An inspectable action discovered from an exported `action("name")…` builder. */
export interface DiscoveredAction {
  /** The action's name — the first string argument to `action(...)`. */
  readonly name: string;
  /** Absolute path of the file that defines it. */
  readonly file: string;
  /** The exported binding name (`export const <exportName> = action(...)`). */
  readonly exportName: string;
  /** True when the builder chain includes `.ref<…>()` (publishes a capability). */
  readonly publishesCapability: boolean;
  /** True when the builder chain includes `.emits<…>()`. */
  readonly events: boolean;
}

/** The result of scanning a project: runnable oms, inspectable actions, and soft warnings. */
export interface Registry {
  readonly oms: DiscoveredOm[];
  readonly actions: DiscoveredAction[];
  /** Non-fatal diagnostics (type errors, unresolved config) — discovery never throws for these. */
  readonly warnings: string[];
}

/**
 * What importing a file in discovery mode reveals — the metadata the AST scan cannot see,
 * because `.describe()`, `.args()` and `.mcp()` only have values once the module has been
 * evaluated. Produced by `discoverRegistrations`, never by `discover`.
 */
export interface Registration {
  readonly name: string;
  /** Absolute path of the defining file. */
  readonly file: string;
  /** The `.describe({ summary })` line, when the author wrote one. */
  readonly summary?: string;
  /** Present only when the author called `.mcp()`. Absent ⇒ not exposed over MCP. */
  readonly mcp?: { readonly mode: "settling" | "long-lived" };
  /** The declared args as JSON Schema. Absent when none were declared. */
  readonly inputSchema?: JsonSchema;
  /** Why this entry cannot be called — currently only "its schema would not convert". */
  readonly unavailable?: string;
}

export interface OmRegistration extends Registration {
  /**
   * `<name>-<hash8>` — the run's log folder, derived from the name and the defining file
   * by the same rule the runtime uses, so it is known before the om has ever run.
   */
  readonly folderName: string;
}

export interface ActionRegistration extends Registration {
  /** The exported binding (`export const <exportName> = action(...)`). */
  readonly exportName: string;
}

/** The result of importing a project's candidate files in discovery mode. */
export interface RegistrationSet {
  readonly oms: OmRegistration[];
  readonly actions: ActionRegistration[];
  /** Import failures and AST warnings — registration discovery never throws for these. */
  readonly warnings: string[];
  /**
   * The AST scan that chose the candidate files, carried through so a caller wanting both
   * halves — the outline and capability flags from the AST, the summaries and schemas from
   * the fork — does not pay to build a second TypeScript program.
   *
   * Absent when the fork was driven with an explicit file list, since there was no scan.
   */
  readonly registry?: Registry;
}
