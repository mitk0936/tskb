import net from "node:net";
import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { portFree } from "../../src/actions/port-free.ts";
import type { PortFreeResult } from "../../src/actions/port-free.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

/**
 * A real listener on an ephemeral port — the gate probes over TCP, so there is nothing
 * worth faking here. Connections are destroyed on arrival so `close()` isn't held open
 * by the probe's own socket.
 */
async function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve) => void server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no ephemeral port");
  return {
    port: address.port,
    close: () => new Promise<void>((resolve) => void server.close(() => resolve())),
  };
}

describe("portFree", () => {
  test("blocks while something is listening, then resolves once the port is released", async () => {
    const { port, close } = await listen();
    let result: PortFreeResult | undefined;

    await om("port-free-release").run(async () => {
      const gate = portFree(port, { intervalMs: 20, connectTimeoutMs: 250, timeoutMs: 5000 });
      setTimeout(() => void close(), 150); // release well after the first probes have failed
      result = await gate.result;
    });

    expect(result).toMatchObject({ port, host: "127.0.0.1" });
    // Proves it actually waited: the first probes saw the listener and were retried.
    expect(result?.attempts).toBeGreaterThan(1);
  });

  test("resolves on the first probe when nothing is listening", async () => {
    const { port, close } = await listen();
    await close(); // the port is now known-free
    let result: PortFreeResult | undefined;

    await om("port-free-immediate").run(async () => {
      result = await portFree(port, { intervalMs: 20, timeoutMs: 5000 }).result;
    });

    expect(result).toEqual({ port, host: "127.0.0.1", attempts: 1 });
  });

  test("rejects when the port stays in use past timeoutMs", async () => {
    const { port, close } = await listen();
    let error: unknown;

    await om("port-free-timeout").run(async () => {
      error = await portFree(port, { intervalMs: 20, timeoutMs: 100 }).result.catch((e) => e);
    });
    await close();

    expect((error as Error).message).toContain(`127.0.0.1:${port} still in use after 100ms`);
  });
});
