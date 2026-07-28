/** A runnable om discovered from a top-level `om("name", …)` call. */
export interface DiscoveredOm {
  /** The om's name — its first string argument. */
  readonly name: string;
  /** Absolute path of the file that defines it. */
  readonly file: string;
  /** 1-based line of the `om(...)` call (informational). */
  readonly line: number;
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
