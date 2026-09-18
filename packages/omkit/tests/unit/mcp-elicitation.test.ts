import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createMcpServer } from "../../src/mcp/server.ts";
import { fixtureClient } from "../support/mcp-harness.ts";
import type { OmkitClient } from "../../src/client/index.ts";

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "omkit-mcp-elicit-"));

let client: OmkitClient;
beforeAll(async () => {
  client = await fixtureClient();
}, 40_000);

afterAll(() => {
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    /* leave the temp dir for the OS to reap */
  }
});

interface Seen {
  message: string;
  requestedSchema: { properties: Record<string, { type: string; enum?: string[] }> };
}

/**
 * A client that declares the elicitation capability and answers with `answer` — or
 * declines, when `answer` is null. This is the whole point of the test: the prompt has to
 * travel om → channel → server → `elicitation/create` → here, and the answer all the way
 * back, through the real SDK request plumbing rather than a stub.
 */
async function connectAnswering(answer: string | null): Promise<{ mcp: Client; seen: Seen[] }> {
  const seen: Seen[] = [];
  const mcp = new Client({ name: "test", version: "0" }, { capabilities: { elicitation: {} } });
  mcp.setRequestHandler(ElicitRequestSchema, (request) => {
    seen.push(request.params as unknown as Seen);
    return answer === null
      ? { action: "decline" as const }
      : { action: "accept" as const, content: { value: answer } };
  });

  const server = createMcpServer({ client, root: workdir });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  await Promise.all([mcp.connect(ct), server.connect(st)]);
  return { mcp, seen };
}

let open: Client | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe("elicitation during a run", () => {
  test("a prompt reaches the client and its answer reaches the run", async () => {
    const { mcp, seen } = await connectAnswering("yes");
    open = mcp;
    const result = await mcp.callTool({ name: "run_om", arguments: { name: "asks" } });

    const verdict = result.structuredContent as {
      ok: boolean;
      assertions: { passed: number; failed: number };
    };
    // The om asserts `answer === "yes"`, so a passing assert proves the answer arrived —
    // not merely that the question was asked.
    expect(verdict.assertions.passed).toBe(1);
    expect(verdict.ok).toBe(true);

    expect(seen).toHaveLength(1);
    expect(seen[0]!.message).toBe("Proceed?");
    // A choice prompt is narrowed with `enum`, so the client cannot answer invalidly.
    expect(seen[0]!.requestedSchema.properties.value!.enum).toEqual(["no", "yes"]);
  }, 90_000);

  test("a declined elicitation falls back to the prompt's default instead of hanging", async () => {
    const { mcp, seen } = await connectAnswering(null);
    open = mcp;
    const result = await mcp.callTool({ name: "run_om", arguments: { name: "asks" } });

    const verdict = result.structuredContent as {
      ok: boolean;
      assertions: { passed: number; failed: number };
    };
    expect(seen).toHaveLength(1);
    // The default is "no", so the om's assert fails — which is the *correct* outcome, and
    // far better than waiting out three prompt timeouts for an answer nobody will give.
    expect(verdict.assertions.failed).toBe(1);
  }, 90_000);
});

describe("a client without the elicitation capability", () => {
  test("does not hang the run — the prompt falls back to its default", async () => {
    const mcp = new Client({ name: "test", version: "0" }); // no elicitation capability
    const server = createMcpServer({ client, root: workdir });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([mcp.connect(ct), server.connect(st)]);
    open = mcp;

    const result = await mcp.callTool({ name: "run_om", arguments: { name: "asks" } });
    const verdict = result.structuredContent as { assertions: { failed: number } };
    expect(verdict.assertions.failed).toBe(1);
  }, 90_000);
});
