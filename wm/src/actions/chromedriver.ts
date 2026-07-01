import { action } from "omkit";

export interface ChromedriverOptions {
  /** Port the chromedriver server listens on. Default 9515. */
  port?: number;
  /** Host the chromedriver server binds to. Default 127.0.0.1. */
  host?: string;
  /** Navigate the launched browser here once the session is up. */
  url?: string;
  /** Launch Chrome without a window. Default false — the browser is visible. */
  headless?: boolean;
  /** Fail session creation if it hasn't completed within this many ms. Default 30000. */
  startTimeoutMs?: number;
}

/** Minimal shape of the W3C `POST /session` response we read. */
interface NewSessionResponse {
  value: {
    sessionId: string;
    capabilities: { "goog:chromeOptions"?: { debuggerAddress?: string } };
  };
}

/**
 * Runs chromedriver and brings up a Chrome under it, publishing that Chrome's
 * CDP endpoint (`host:port`) as this action's handle so a connect-and-drive
 * action — e.g. {@link import("./browser-page.ts").browserPage} — can attach to
 * the same live browser over the DevTools Protocol.
 *
 * The chromedriver binary runs through `proc` (via its `npx` bin, so the shell
 * needs no quoted-path handling), streaming its output into the run log and
 * tree-killing the npx → chromedriver → Chrome tree on teardown. We then speak
 * raw W3C WebDriver over `fetch` to create the session (chromedriver reports the
 * browser's `debuggerAddress` in the returned capabilities) and to navigate.
 * Daemon-shaped:
 * stay alive until the run's `signal` aborts, then delete the session before
 * `proc` reaps the driver.
 */
export const chromedriver = action("ChromeDriver")
  .ref<string>()
  .run(async ({ logs, signal, proc, attach }, opts: ChromedriverOptions = {}) => {
    const { port = 9515, host = "127.0.0.1", url, headless = false, startTimeoutMs = 30000 } = opts;
    const base = `http://${host}:${port}`;

    // Long-running server: don't await it. proc streams its logs and kills it on
    // teardown; the catch keeps an early exit from surfacing as an unhandled
    // rejection (session setup below fails loudly enough on its own).
    const server = proc("chromedriver", {})`npx --no -- chromedriver --port=${String(port)}`;
    void server.catch(() => {});

    const fetchJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
      const res = await fetch(`${base}${path}`, { signal, ...init });
      if (!res.ok) throw new Error(`chromedriver ${path} → ${res.status} ${await res.text()}`);
      return (await res.json()) as T;
    };

    // Poll /status until the driver reports ready (it accepts connections before
    // it's able to create sessions). Each miss waits briefly, bounded by the
    // overall start timeout and unblocked by teardown via the abort signal.
    const deadline = Date.now() + startTimeoutMs;
    for (;;) {
      try {
        const { value } = await fetchJson<{ value: { ready: boolean } }>("/status");
        if (value.ready) break;
      } catch {
        if (signal.aborted) throw new Error("chromedriver: aborted before ready");
      }
      if (Date.now() > deadline)
        throw new Error(`chromedriver: not ready within ${startTimeoutMs}ms`);
      await new Promise((r) => setTimeout(r, 150));
    }

    const args = [
      ...(headless ? ["--headless=new"] : []),
      "--no-first-run",
      "--no-default-browser-check",
    ];
    const session = await fetchJson<NewSessionResponse>("/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        capabilities: {
          alwaysMatch: { browserName: "chrome", "goog:chromeOptions": { args } },
        },
      }),
    });

    const sessionId = session.value.sessionId;
    const debuggerAddress = session.value.capabilities["goog:chromeOptions"]?.debuggerAddress;
    if (!debuggerAddress) {
      throw new Error("chromedriver: session created but no debuggerAddress was reported");
    }
    logs.append({ source: "ChromeDriver", level: "info", message: `session ${sessionId}` });

    if (url) {
      await fetchJson(`/session/${sessionId}/url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      logs.append({ source: "ChromeDriver", level: "info", message: `opened ${url}` });
    }

    attach(debuggerAddress); // resolves instance.ref → the CDP endpoint
    logs.append({ source: "ChromeDriver", level: "info", message: `cdp ${debuggerAddress}` });

    // Daemon: hold the browser open until teardown, then quit the session (best
    // effort — a fresh, un-signalled fetch, since the run's signal is aborting).
    return new Promise<void>((resolveRun) => {
      const stop = (): void => {
        void fetch(`${base}/session/${sessionId}`, { method: "DELETE" })
          .catch(() => {})
          .finally(resolveRun);
      };
      if (signal.aborted) stop();
      else signal.addEventListener("abort", stop, { once: true });
    });
  });
