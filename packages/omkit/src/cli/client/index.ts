import { discover } from "./discovery.ts";
import { runOm } from "./runner.ts";
import { runCheck } from "./check.ts";
import type { OmkitClient } from "./types.ts";

export type {
  OmkitClient,
  RunSession,
  RunOptions,
  Verdict,
  Diagnostic,
  PromptRequest,
  RunEvents,
} from "./types.ts";
export type { Registry, DiscoveredOm, DiscoveredAction } from "./registry.ts";

/** Configuration for a client — the path to the project's `tsconfig.omkit.json`. */
export interface OmkitConfig {
  tsconfig: string;
}

/** Build the headless engine: discovery + supervised run + typecheck over one config. */
export function createOmkitClient(config: OmkitConfig): OmkitClient {
  return {
    discover: async () => discover(config.tsconfig),
    run: (omFile, opts) => runOm(omFile, opts),
    check: async () => runCheck(config.tsconfig),
  };
}
