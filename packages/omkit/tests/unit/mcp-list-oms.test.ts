import { afterEach, describe, expect, test } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.ts";
import type { OmkitClient } from "../../src/client/index.ts";
import type { RegistrationSet } from "../../src/client/registry.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * A stub client: the server is the unit under test, and forking a real discovery child per
 * assertion would be slow and would re-cover the registration tests' ground.
 */
function stubClient(set: RegistrationSet): OmkitClient {
  return {
    tsconfig: "tsconfig.omkit.json",
    discover: async () => ({ oms: [], actions: [], warnings: [] }),
    discoverRegistrations: async () => set,
    run: () => {
      throw new Error("not used in this test");
    },
    runBare: async () => 0,
    check: async () => [],
  };
}

const registrations: RegistrationSet = {
  oms: [
    {
      name: "smoke",
      file: "/p/oms/smoke.ts",
      folderName: "smoke-a1b2c3d4",
      summary: "Boot the app and run the smoke suite",
      mcp: { mode: "settling" },
      inputSchema: { type: "object", properties: { headless: { type: "boolean" } } },
    },
    { name: "hidden", file: "/p/oms/hidden.ts", folderName: "hidden-00000000" },
    {
      name: "when",
      file: "/p/oms/when.ts",
      folderName: "when-11111111",
      mcp: { mode: "settling" },
      unavailable: "Date cannot be represented in JSON Schema",
    },
  ],
  actions: [
    {
      name: "seed",
      file: "/p/actions/seed.ts",
      exportName: "seed",
      summary: "Seed the database",
      mcp: { mode: "settling" },
      inputSchema: { type: "object", properties: { rows: { type: "number" } } },
    },
    { name: "lint", file: "/p/actions/lint.ts", exportName: "lint" },
  ],
  warnings: ["oms/broken.ts: boom"],
};

async function connectTo(client: OmkitClient): Promise<Client> {
  const server = createMcpServer({ client, root: here });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcp = new Client({ name: "test", version: "0" });
  await Promise.all([mcp.connect(clientTransport), server.connect(serverTransport)]);
  return mcp;
}

const connect = (set: RegistrationSet = registrations): Promise<Client> =>
  connectTo(stubClient(set));

type Listed = { entries: Array<Record<string, unknown>>; warnings: string[] };

let open: Client | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("the MCP server", () => {
  test("serves list_oms over a real client connection", async () => {
    open = await connect();
    const { tools } = await open.listTools();
    expect(tools.map((t) => t.name)).toContain("list_oms");
  });

  test("advertises a fixed tool list that does not depend on the project", async () => {
    // The headline claim of the generic-tools design: adding an om changes what list_oms
    // *returns*, never what tools exist. Six, always.
    open = await connect();
    const { tools } = await open.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "cancel_run",
      "get_run",
      "list_oms",
      "run_om",
      "start_om",
      "tail_run",
    ]);
  });

  test("declares list_oms read-only, so a client knows it is safe to call", async () => {
    open = await connect();
    const { tools } = await open.listTools();
    expect(tools.find((t) => t.name === "list_oms")!.annotations?.readOnlyHint).toBe(true);
  });
});

describe("list_oms", () => {
  test("lists only entries that called .mcp(), with their summary and mode", async () => {
    open = await connect();
    const result = await open.callTool({ name: "list_oms", arguments: {} });
    const listed = result.structuredContent as Listed;

    expect(listed.entries.map((e) => e.name).sort()).toEqual(["seed", "smoke", "when"]);
    expect(listed.entries.find((e) => e.name === "smoke")).toMatchObject({
      kind: "om",
      mode: "settling",
      summary: "Boot the app and run the smoke suite",
      folderName: "smoke-a1b2c3d4",
    });
    expect(listed.warnings).toContain("oms/broken.ts: boom");
  });

  test("an unconvertible schema lists as unavailable and the others still list", async () => {
    open = await connect();
    const result = await open.callTool({ name: "list_oms", arguments: {} });
    const listed = result.structuredContent as Listed;
    const when = listed.entries.find((e) => e.name === "when")!;
    expect(when.unavailable).toBe("Date cannot be represented in JSON Schema");
    expect(when.inputSchema).toBeUndefined();
    expect(listed.entries.find((e) => e.name === "smoke")!.inputSchema).toBeDefined();
  });

  test("an exposed action is listed as an action, with its export name", async () => {
    open = await connect();
    const result = await open.callTool({ name: "list_oms", arguments: {} });
    const listed = result.structuredContent as Listed;
    expect(listed.entries.find((e) => e.name === "seed")).toMatchObject({
      kind: "action",
      exportName: "seed",
    });
  });

  test("discovery is cached for the process and refreshed on request", async () => {
    let calls = 0;
    const counting: OmkitClient = {
      ...stubClient(registrations),
      discoverRegistrations: async () => {
        calls += 1;
        return registrations;
      },
    };
    open = await connectTo(counting);

    await open.callTool({ name: "list_oms", arguments: {} });
    await open.callTool({ name: "list_oms", arguments: {} });
    expect(calls).toBe(1);
    await open.callTool({ name: "list_oms", arguments: { refresh: true } });
    expect(calls).toBe(2);
  });
});
