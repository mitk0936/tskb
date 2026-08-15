import type { z } from "zod";
import { toJsonSchema } from "./schema-json.ts";
import type { DescribedArgs, OmDescription, ResolvedMcpExposure } from "./types.ts";

/**
 * What an om reports in discovery mode, posted the moment `.run(...)` is reached.
 *
 * Sent over the fork's IPC channel rather than collected in a module variable: a user's
 * file resolves `"omkit"` to the installed package while the discovery child runs omkit's
 * own module graph, so the two can hold different copies of omkit — and a shared variable
 * would be written in one and read in the other, coming back empty with no error and no
 * clue why. `process.send` is copy-independent.
 */
export interface OmRegistrationMessage {
  readonly kind: "om-registration";
  readonly name: string;
  /** The defining file — the same input the run's identity hashes. No `:line`. */
  readonly file: string | undefined;
  readonly description: OmDescription | undefined;
  readonly mcp: ResolvedMcpExposure | undefined;
  /** The declared args as JSON Schema; undefined when the om declares none. */
  readonly inputSchema: DescribedArgs["inputSchema"];
  /** Set when `.args(schema)` would not convert — the entry lists as unavailable. */
  readonly schemaError: DescribedArgs["schemaError"];
}

/**
 * Discovery mode. The child forked by `discoverRegistrations()` sets `OMKIT_DISCOVER=1`
 * and imports om files purely to read what they declare. In that mode `launch()` posts a
 * registration and returns: no ExecutionTree, no log folder, no body.
 *
 * The flag is read once at import and then deleted from the environment, so a subprocess
 * an om happens to spawn does not inherit it — the same discipline `OMKIT_SUPERVISED` and
 * `OMKIT_ARGS` already follow.
 */
function detect(): boolean {
  const discovering = process.env.OMKIT_DISCOVER === "1";
  delete process.env.OMKIT_DISCOVER;
  return discovering;
}

let discovering = detect();

export function isDiscovering(): boolean {
  return discovering;
}

/** Test seam: enter or leave discovery mode without forking a child. */
export function setDiscovering(on: boolean): void {
  discovering = on;
}

/** Where a registration goes. */
export type RegistrationSink = (registration: OmRegistrationMessage) => void;

/** The real sink: straight up the fork's IPC channel. A no-op with no channel. */
const ipcSink: RegistrationSink = (registration) => {
  process.send?.(registration);
};

let sink: RegistrationSink = ipcSink;

/** Test seam: collect registrations in-process. Pass `null` to restore the IPC sink. */
export function setRegistrationSink(next: RegistrationSink | null): void {
  sink = next ?? ipcSink;
}

export function reportOm(registration: OmRegistrationMessage): void {
  sink(registration);
}

/**
 * Convert a declared schema, never throwing. `z.toJSONSchema` rejects schemas it cannot
 * represent (`z.date()`, `z.custom()`, anything built on them), and one such entry must
 * not take the whole tool list down with it — so the failure is carried as data on that
 * entry alone. `undefined` in (no `.args()`) means nothing to report either way.
 */
export function describeSchema(schema: unknown): DescribedArgs {
  if (schema === undefined) return { inputSchema: undefined, schemaError: undefined };
  try {
    return { inputSchema: toJsonSchema(schema as z.ZodType), schemaError: undefined };
  } catch (e) {
    return {
      inputSchema: undefined,
      schemaError: e instanceof Error ? e.message : String(e),
    };
  }
}
