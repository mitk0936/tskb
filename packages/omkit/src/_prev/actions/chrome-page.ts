import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { action } from "../orchestration/action/action.ts";

// Re-export the handle's type so consumers can name it without depending on
// playwright-core directly — tswm owns that dependency on their behalf.
export type { Page, Browser, BrowserContext } from "playwright-core";

/**
 * Where {@link chromePage} gets its page from:
 * - a **CDP endpoint** (`host:port` or `http://host:port`) — it connects, and
 *   owns (closes) that connection on teardown;
 * - an existing **`Page`** — e.g. an Electron `BrowserWindow`, used as-is;
 * - a **`BrowserContext`** or **`Browser`** — a page is taken (or opened) from it.
 *
 * Handle sources aren't owned: teardown never closes a browser/window the action
 * didn't open, leaving its lifecycle to whoever launched it.
 */
export type ChromePageSource = string | Page | BrowserContext | Browser;

/** Events {@link chromePage} pushes to the global log (and exposes via `.on`). */
export interface ChromePageEvents {
  /** A `console.*` call in the page; payload is the rendered text. */
  console: string;
  /** An uncaught error in the page; payload is its message. */
  pageerror: string;
  /** A top-level navigation settled; payload is the new URL. */
  navigated: string;
}

export interface ChromePageOptions {
  /**
   * Navigate the attached page here once acquired. Omit to drive the page as-is
   * (the existing window, or the first page of a connected/handed-in browser).
   */
  url?: string;
}

// Playwright's classes are structurally distinct by these methods; only Browser
// has `contexts()`, only Page has `mainFrame()`, and a BrowserContext has
// `newPage()` without either — enough to tell a handed-in handle apart.
const isPage = (x: object): x is Page => typeof (x as Page).mainFrame === "function";
const isBrowser = (x: object): x is Browser => typeof (x as Browser).contexts === "function";

/** Take the first existing page of a context, or open one. */
const pageOf = (context: BrowserContext, fresh: boolean): Promise<Page> | Page =>
  fresh ? context.newPage() : (context.pages()[0] ?? context.newPage());

/**
 * Publishes a Chrome/Chromium {@link Page} as this action's handle, so downstream
 * actions can await `instance.ref` and drive the same live page. The page comes
 * from whatever {@link ChromePageSource} is given — a CDP endpoint to connect to,
 * or an already-owned Playwright handle (an Electron `BrowserWindow` page, a
 * `BrowserContext`, or a `Browser`). The source may be a promise, so it wires
 * straight from another action's `.ref` (e.g. `chromePage("Explorer",
 * chromedriver.ref)` or `chromePage("App", electronApp.ref)`).
 *
 * Daemon-shaped like the watch actions: acquire the page, attach it, then stay
 * alive on a promise that only resolves when the run's `signal` aborts. On
 * teardown it closes the CDP connection *only* when it opened one — a handed-in
 * browser or window is left untouched for its owner to close.
 *
 * `label` names this page in the log (its `source`), so several `chromePage`
 * instances in one run stay distinguishable — e.g. `chromePage("Explorer",
 * chrome.ref)` logs its lines under `Explorer` rather than a shared default.
 */
export const chromePage = action("Chrome Page")
  .emits<ChromePageEvents>()
  .ref<Page>()
  .run(
    async (
      { logs, signal, emit, attach },
      label: string,
      source: ChromePageSource | Promise<ChromePageSource>,
      opts: ChromePageOptions = {}
    ) => {
      const { url } = opts;
      const resolved = await source;

      // Resolve the source to a Page, recording what (if anything) we own. Only a
      // CDP connection we open here is ours to close; handles belong to callers.
      let owned: Browser | undefined;
      let page: Page;
      let from: string;

      if (typeof resolved === "string") {
        const cdpUrl = resolved.includes("://") ? resolved : `http://${resolved}`;
        from = cdpUrl;
        try {
          // connectOverCDP resolves the ws endpoint from /json/version under the
          // hood, so the plain http URL is what to hand it.
          owned = await chromium.connectOverCDP(cdpUrl);
        } catch (cause) {
          throw new Error(`could not connect to Chrome over CDP at ${cdpUrl}`, { cause });
        }
        const context = owned.contexts()[0] ?? (await owned.newContext());
        page = await pageOf(context, url !== undefined);
      } else if (isPage(resolved)) {
        from = "page handle";
        page = resolved;
      } else if (isBrowser(resolved)) {
        from = "browser handle";
        const context = resolved.contexts()[0] ?? (await resolved.newContext());
        page = await pageOf(context, url !== undefined);
      } else {
        from = "context handle";
        page = await pageOf(resolved, url !== undefined);
      }

      page.on("console", (msg) => {
        logs.append({ source: label, level: "info", message: `console: ${msg.text()}` });
        emit("console", `from: ${label}:  ${msg.text()}`);
      });
      page.on("pageerror", (err) => {
        logs.append({ source: label, level: "error", message: err.message });
        emit("pageerror", `from: ${label}:  ${err.message}`);
      });
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) emit("navigated", `${label}: ${frame.url()}`);
      });

      if (url) {
        await page.goto(url);
        logs.append({ source: label, level: "info", message: `navigated ${url}` });
      }

      attach(page); // resolves instance.ref for every downstream action
      logs.append({ source: label, level: "info", message: `attached ${from}` });

      // Daemon: hold the page open until teardown, then drop the CDP session if it
      // was ours; never close a handed-in browser/window.
      return new Promise<void>((resolveRun) => {
        const stop = (): void => {
          if (owned) void owned.close().finally(resolveRun);
          else resolveRun();
        };
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      });
    }
  );
