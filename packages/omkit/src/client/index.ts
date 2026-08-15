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
  // A per-call inspect wins; the client's construction-time inspect is the fallback.
  const withInspect = (opts: RunOptions | undefined): RunOptions => ({
    ...opts,
    inspect: opts?.inspect ?? config.inspect,
  });
  return {
    tsconfig: config.tsconfig,
    discover: async () => discover(config.tsconfig),
    discoverRegistrations: async () => discoverRegistrations(config.tsconfig),
    run: (omFile, opts) => runOm(omFile, withInspect(opts)),
    runBare: (omFile, opts) => spawnBare(omFile, withInspect(opts)),
    check: async () => runCheck(config.tsconfig),
  };
}
