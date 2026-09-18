import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.ts";
import { registerResources } from "./resources.ts";
import { RunRegistry } from "./runs.ts";
import type { OmkitClient } from "../client/index.ts";

/**
 * Kept in step with package.json by hand. It is only the version this server reports to a
 * client in `initialize`, so drifting is cosmetic — but bump both together.
 */
const VERSION = "0.7.0";

export interface McpServerOptions {
  /** The engine every omkit frontend goes through — the MCP server is the third one. */
  readonly client: OmkitClient;
  /** Project root: run folders resolve under `<root>/logs`. */
  readonly root: string;
}

/**
 * Build the server without binding a transport, so tests can connect it to an in-memory
 * pair and a real launch can hand it stdio. Registration is assembly only: what each tool
 * and resource does lives in its own module.
 */
export function createMcpServer(opts: McpServerOptions): McpServer {
  const server = new McpServer(
    { name: "omkit", version: VERSION },
    { capabilities: { tools: {}, resources: {} } }
  );
  const runs = new RunRegistry();
  registerTools(server, { client: opts.client, root: opts.root, runs });
  registerResources(server, { root: opts.root });

  // The client hung up. Its runs are children of this process and must not outlive it.
  // Chain rather than assign: `onclose` is a single slot on the SDK's Protocol base, so a
  // bare assignment would silently drop whatever the SDK (or a future us) put there.
  const previousOnClose = server.server.onclose;
  server.server.onclose = () => {
    runs.cancelAll();
    previousOnClose?.();
  };
  return server;
}

/**
 * Bind the server to stdio and serve until the client disconnects. Nothing on this path
 * may write to stdout: it *is* the JSON-RPC stream. Diagnostics go to stderr.
 */
export async function startMcpServer(opts: McpServerOptions): Promise<void> {
  const server = createMcpServer(opts);
  await server.connect(new StdioServerTransport());
}
