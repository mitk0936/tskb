import { startMcpServer } from "../../mcp/server.ts";
import type { OmkitClient } from "../../client/index.ts";

/**
 * The `mcp` command: serve this project over MCP on stdio, until the client hangs up.
 *
 * Deliberately silent. Every other command prints; this one must not, because its stdout
 * is the protocol stream — a banner here reaches the client as a JSON parse error.
 */
export async function mcpCommand(client: OmkitClient, opts: { root: string }): Promise<void> {
  await startMcpServer({ client, root: opts.root });
  // `connect` resolves once the transport is bound; the transport keeps the process alive
  // from here, so hold the command open rather than falling out of `main` and exiting.
  await new Promise<void>(() => {});
}
