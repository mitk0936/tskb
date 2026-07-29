import net from "node:net";
import { action } from "../core/action.ts";

export interface PortFreeOptions {
  /** Host to probe. Default "127.0.0.1". */
  host?: string;
  /** Delay between probes. Default 500ms. */
  intervalMs?: number;
  /** Abort a single connect attempt that hasn't answered within this long. Default 1000ms. */
  connectTimeoutMs?: number;
  /** Reject after this long overall. Default 30000ms; pass `undefined` to wait until teardown. */
  timeoutMs?: number;
}

/** The probe that found the port free — this action's result and `free` event payload. */
export interface PortFreeResult {
  port: number;
  host: string;
  attempts: number;
}

/** Events emitted by {@link portFree}. */
export interface PortFreeEvents {
  /** Nothing is listening any more; payload is the passing probe. */
  free: PortFreeResult;
}

/**
 * One TCP connect attempt. A refusal is the only answer that proves nobody is
 * listening: a successful connect means the port is taken, and a hang or any other
 * error (filtered, unreachable) is inconclusive, so both count as still busy rather
 * than letting a firewall read as "free".
 */
const probe = (
  port: number,
  host: string,
  connectTimeoutMs: number,
  signal: AbortSignal
): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (free: boolean): void => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      socket.destroy();
      resolve(free);
    };
    // Teardown mid-connect: drop the socket and report "busy" — the loop's own abort
    // check turns that into a clean stop on the next pass.
    function onAbort(): void {
      finish(false);
    }

    socket.setTimeout(connectTimeoutMs);
    socket.once("connect", () => finish(false));
    socket.once("timeout", () => finish(false));
    socket.once("error", (error: NodeJS.ErrnoException) => finish(error.code === "ECONNREFUSED"));

    signal.addEventListener("abort", onAbort, { once: true });
    socket.connect(port, host);
  });

/**
 * Gate: polls a TCP port until nothing is listening on it, then resolves with that
 * probe and emits `free`. The mirror of `healthcheck` — where that one waits
 * for a service to come up, this waits for one to let go, so a restart can rebind
 * without racing the previous process's socket. Bounded by the run's abort signal
 * and `timeoutMs`, so teardown unblocks a pending probe instead of hanging.
 */
export const portFree = action("portFree")
  .emits<PortFreeEvents>()
  .run(async ({ signal, emit }, port: number, opts: PortFreeOptions = {}) => {
    const {
      host = "127.0.0.1",
      intervalMs = 500,
      connectTimeoutMs = 1000,
      timeoutMs = 30_000,
    } = opts;

    // Abortable inter-probe delay: resolves after `ms`, or rejects on teardown.
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(new Error("portFree: aborted"));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      });

    const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
    const target = `${host}:${port}`;
    console.log(`waiting for ${target} to free up`);

    let attempts = 0;
    for (;;) {
      if (signal.aborted) throw new Error("portFree: aborted");
      attempts++;
      if (await probe(port, host, connectTimeoutMs, signal)) {
        const result: PortFreeResult = { port, host, attempts };
        const probes = `${attempts} ${attempts === 1 ? "probe" : "probes"}`;
        console.log(`free ${target} (${probes})`);
        emit("free", result);
        return result;
      }

      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error(
          `portFree: ${target} still in use after ${timeoutMs}ms (${attempts} probes)`
        );
      }
      await sleep(intervalMs);
    }
  });
