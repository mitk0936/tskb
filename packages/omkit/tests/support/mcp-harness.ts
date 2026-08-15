import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.ts";
import { createOmkitClient, readRegistrations } from "../../src/client/index.ts";
import type { OmkitClient } from "../../src/client/index.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const fixtureDir = path.join(here, "../fixtures/registrations");

/** The registration fixtures, listed explicitly — the AST scan cannot see them (GC 12). */
export const fixtureFiles = [
  "oms/exposed.ts",
  "oms/hidden.ts",
  "oms/settles.ts",
  "oms/fails.ts",
  "oms/mislabelled.ts",
  "oms/waits.ts",
  "oms/asks.ts",
  "actions/seed.ts",
].map((f) => path.join(fixtureDir, f));

/**
 * A real client over the fixture project, with only `discoverRegistrations` overridden.
 * The registration set comes from a real fork over {@link fixtureFiles}; `run` is
 * untouched, so tools still fork real oms and read back real verdicts. The override exists
 * because the AST scan matches the literal `"omkit"` and these fixtures import omkit
 * relatively — not because the server is being faked.
 */
export async function fixtureClient(): Promise<OmkitClient> {
  const real = createOmkitClient({ tsconfig: path.join(fixtureDir, "tsconfig.omkit.json") });
  const set = await readRegistrations(fixtureFiles);
  return { ...real, discoverRegistrations: async () => set };
}

/** Connect an in-process client to a server built over `client`. Close it in `afterEach`. */
export async function connectServer(client: OmkitClient, root: string): Promise<Client> {
  const server = createMcpServer({ client, root });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test", version: "0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
  return mcp;
}

/**
 * The text a tool result carries. Read the blocks rather than stringifying the result:
 * JSON.stringify escapes the quotes omkit puts around an argument name, so
 * `missing required argument "rows"` becomes `...\"rows\"` and a plain regex misses it.
 */
export const textOf = (result: { content?: unknown }): string =>
  ((result.content ?? []) as Array<{ type: string; text?: string }>)
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("\n");

/**
 * Poll `get_run` until the run settles. Polling rather than sleeping a fixed amount: how
 * long a run takes is not the assertion's business, and a fixed sleep is either flaky or
 * slow. Returns the settled payload, or throws if it never settles.
 */
export async function waitForSettled(
  mcp: Client,
  runId: string,
  timeoutMs = 30_000
): Promise<{ status: string; folder: string; ok?: boolean }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const seen = (await mcp.callTool({ name: "get_run", arguments: { run: runId } }))
      .structuredContent as { status: string; folder: string; ok?: boolean };
    if (seen.status === "settled") return seen;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`run ${runId} did not settle within ${timeoutMs}ms`);
}
