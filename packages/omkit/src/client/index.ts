import path from "node:path";
import { discover, discoverRegistrations } from "./discovery.ts";
import { runOm, spawnBare } from "./runner.ts";
import { runCheck } from "./check.ts";
import type { OmkitClient } from "./types.ts";

export { readRegistrations, discoverRegistrations } from "./discovery.ts";

export type {
  OmkitClient,
  RunSession,
  RunOptions,
  InspectOptions,
  Verdict,
  Diagnostic,
  PromptRequest,
  RunEvents,
} from "./types.ts";
export type {
  Registry,
  DiscoveredOm,
  DiscoveredAction,
  Registration,
  OmRegistration,
  ActionRegistration,
  RegistrationSet,
} from "./registry.ts";
import type { InspectOptions, RunOptions } from "./types.ts";

/** Configuration for a client — the project's `tsconfig.omkit.json` and optional debugging. */
export interface OmkitConfig {
  tsconfig: string;
  /** When set, every run this client launches forks with the Node inspector open. */
  inspect?: InspectOptions;
}

/** Build the headless engine: discovery + supervised/bare run + typecheck over one config. */
export function createOmkitClient(config: OmkitConfig): OmkitClient {
  // The project every run of this client belongs to: the directory owning the config it was
  // built from. Injected here rather than at each frontend because "which project is this?" has
  // one answer per client, and three call sites remembering it separately is how the terminal
  // and the MCP server ended up writing their run folders to two different trees.
  const root = path.dirname(path.resolve(config.tsconfig));

  // A per-call inspect wins; the client's construction-time inspect is the fallback. Likewise
  // a caller may name its own root — the injected one is a default, not an override.
  const withDefaults = (opts: RunOptions | undefined): RunOptions => ({
    ...opts,
    inspect: opts?.inspect ?? config.inspect,
    env: { OMKIT_ROOT: root, ...opts?.env },
  });
  return {
    tsconfig: config.tsconfig,
    discover: async () => discover(config.tsconfig),
    discoverRegistrations: async () => discoverRegistrations(config.tsconfig),
    run: (omFile, opts) => runOm(omFile, withDefaults(opts)),
    runBare: (omFile, opts) => spawnBare(omFile, withDefaults(opts)),
    check: async () => runCheck(config.tsconfig),
  };
}
