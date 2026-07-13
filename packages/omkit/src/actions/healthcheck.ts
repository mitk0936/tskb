import { action } from "../core/action.ts";

/** How a probe's HTTP status is judged healthy: an exact code, a set, or a predicate. */
export type StatusMatcher = number | number[] | ((status: number) => boolean);

/** How a probe's response body is judged healthy: a substring, a regex, or a predicate. */
export type BodyMatcher = string | RegExp | ((body: string) => boolean);

export interface HealthcheckOptions {
  /** Full URL to probe. Overrides host/port/path/protocol when set. */
  url?: string;
  /** Host to probe when building from parts. Default "localhost". */
  host?: string;
  /** Port to probe when building from parts. */
  port?: number;
  /** Path appended after host:port when building from parts. Default "/". */
  path?: string;
  /** Scheme when building from parts. Default "http". */
  protocol?: "http" | "https";
  /** Acceptable status. Default: any 2xx. */
  status?: StatusMatcher;
  /** Optional body match against the response text. Omit to ignore the body. */
  body?: BodyMatcher;
  /** Delay between probes. Default 250ms. */
  intervalMs?: number;
  /** Abort a single probe that hasn't responded within this long. Default 5000ms. */
  requestTimeoutMs?: number;
  /** Reject after this long overall. Omit to probe until healthy or teardown. */
  timeoutMs?: number;
  /** Per-request overrides (method, headers, …). Default a plain GET. */
  request?: RequestInit;
}

/** The passing probe — also this action's result and `healthy` event payload. */
export interface HealthcheckResult {
  url: string;
  status: number;
  attempts: number;
}

/** Events emitted by {@link healthcheck}. */
export interface HealthcheckEvents {
  /** The target passed every matcher; payload is the passing probe. */
  healthy: HealthcheckResult;
}

/**
 * Gate: polls an HTTP endpoint until it answers in a healthy way (status and,
 * optionally, body), then resolves with that probe and emits `healthy`. Refusals
 * and slow probes during startup are retried; each request is bounded by
 * `requestTimeoutMs` and the whole wait by the run's abort signal and optional
 * `timeoutMs`, so teardown unblocks a pending probe instead of hanging.
 */
export const healthcheck = action("healthcheck")
  .emits<HealthcheckEvents>()
  .run(async ({ signal, emit }, opts: HealthcheckOptions = {}) => {
    const {
      url: rawUrl,
      host = "localhost",
      port,
      path = "/",
      protocol = "http",
      status = (s: number): boolean => s >= 200 && s < 300,
      body,
      intervalMs = 250,
      requestTimeoutMs = 5000,
      timeoutMs,
      request,
    } = opts;

    const url = rawUrl ?? (port !== undefined ? `${protocol}://${host}:${port}${path}` : undefined);
    if (!url) throw new Error("healthcheck: provide a `url` or a `port`");

    const statusOk = (s: number): boolean =>
      typeof status === "function"
        ? status(s)
        : Array.isArray(status)
          ? status.includes(s)
          : status === s;
    const bodyOk = (text: string): boolean =>
      body === undefined
        ? true
        : typeof body === "function"
          ? body(text)
          : body instanceof RegExp
            ? body.test(text)
            : text.includes(body);

    // Abortable inter-probe delay: resolves after `ms`, or rejects on teardown.
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve, reject) => {
        const onAbort = (): void => {
          clearTimeout(timer);
          reject(new Error("healthcheck: aborted"));
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        if (signal.aborted) onAbort();
        else signal.addEventListener("abort", onAbort, { once: true });
      });

    const deadline = timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
    console.log(`probing ${url}`);

    let attempts = 0;
    for (;;) {
      if (signal.aborted) throw new Error("healthcheck: aborted");
      attempts++;
      try {
        const res = await fetch(url, {
          ...request,
          signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]),
        });
        if (statusOk(res.status)) {
          const text = body === undefined ? "" : await res.text();
          if (body === undefined) await res.body?.cancel().catch(() => {});
          if (bodyOk(text)) {
            const result: HealthcheckResult = { url, status: res.status, attempts };
            const probes = `${attempts} ${attempts === 1 ? "probe" : "probes"}`;
            console.log(`healthy ${url} → ${res.status} (${probes})`);
            emit("healthy", result);
            return result;
          }
        } else {
          await res.body?.cancel().catch(() => {});
        }
      } catch {
        if (signal.aborted) throw new Error("healthcheck: aborted");
      }

      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error(
          `healthcheck: ${url} not healthy within ${timeoutMs}ms (${attempts} probes)`
        );
      }
      await sleep(intervalMs);
    }
  });
