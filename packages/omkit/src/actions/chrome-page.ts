import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { action } from "../core/action.ts";

// Re-export so consumers can name the handle without depending on playwright-core.
export type { Page, Browser, BrowserContext } from "playwright-core";

/**
 * Where {@link chromePage} gets its page:
 * - a **CDP endpoint** (`host:port` or `http://host:port`) — connected and owned
 *   (closed on teardown);
 * - an existing **`Page`** (e.g. an Electron window) — used as-is;
 * - a **`BrowserContext`** or **`Browser`** — a page is taken (or opened) from it.
 *
 * Handles aren't owned: teardown never closes a browser/window the action didn't open.
 */
export type ChromePageSource = string | Page | BrowserContext | Browser;

/** Events {@link chromePage} emits. */
export interface ChromePageEvents {
  console: string;
  pageerror: string;
  navigated: string;
}

export interface ChromePageOptions {
  /** Navigate the attached page here once acquired. Omit to drive it as-is. */
  url?: string;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const isPage = (x: object): x is Page => typeof (x as Page).mainFrame === "function";
const isBrowser = (x: object): x is Browser => typeof (x as Browser).contexts === "function";

/** Take the first existing page of a context, or open one. */
const pageOf = (context: BrowserContext, fresh: boolean): Promise<Page> | Page =>
  fresh ? context.newPage() : (context.pages()[0] ?? context.newPage());

/**
 * Publishes a Chrome/Chromium {@link Page} as this action's handle, so downstream
 * actions can await `instance.ref` and drive the same live page. The source is a
 * resolved handle, not a promise — chain it from another action by awaiting that
 * action's `.ref` at the call site (e.g.
 * `chromePage("Explorer", await chromedriver.ref)`). `label` tags this run so several
 * pages in one run stay distinguishable. Daemon: acquire + attach, stay alive
 * until teardown, then close the CDP connection only when it opened one.
 */
export const chromePage = action("chromePage")
  .emits<ChromePageEvents>()
  .ref<Page>()
  .run(
    async (
      { signal, emit, attach, tag },
      label: string,
      source: ChromePageSource,
      opts: ChromePageOptions = {}
    ) => {
      tag(label);
      const { url } = opts;

      // Only a CDP connection we open here is ours to close; handles belong to callers.
      let owned: Browser | undefined;
      let page: Page;
      let from: string;

      if (typeof source === "string") {
        const cdpUrl = source.includes("://") ? source : `http://${source}`;
        from = cdpUrl;
        try {
          owned = await chromium.connectOverCDP(cdpUrl);
        } catch (cause) {
          throw new Error(`could not connect to Chrome over CDP at ${cdpUrl}`, { cause });
        }
        const context = owned.contexts()[0] ?? (await owned.newContext());
        page = await pageOf(context, url !== undefined);
      } else if (isPage(source)) {
        from = "page handle";
        page = source;
      } else if (isBrowser(source)) {
        from = "browser handle";
        const context = source.contexts()[0] ?? (await source.newContext());
        page = await pageOf(context, url !== undefined);
      } else {
        from = "context handle";
        page = await pageOf(source, url !== undefined);
      }

      page.on("console", (msg) => {
        console.log(`console: ${msg.text()}`);
        emit("console", `from: ${label}:  ${msg.text()}`);
      });
      page.on("pageerror", (err) => {
        console.error(err.message);
        emit("pageerror", `from: ${label}:  ${err.message}`);
      });
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) emit("navigated", `${label}: ${frame.url()}`);
      });

      if (url) {
        await page.goto(url);
        console.log(`navigated ${url}`);
      }

      // Oms run under tsx, which forces esbuild `keepNames`: every function serialized into
      // page.evaluate() carries a bare `__name(...)` wrapper that is undefined in the page and
      // throws `ReferenceError: __name is not defined`. Define a no-op __name so those bodies
      // run. Scope it to the whole context, not just this page: downstream code often drives
      // sibling windows via context.pages() (e.g. Electron windows), which never see a
      // page-level shim. addInitScript covers documents created later; evaluate seeds the ones
      // already open now (Electron windows exist before we attach). Passed as a string so tsx
      // doesn't rewrite — and re-break — the shim itself.
      const nameShim = "globalThis.__name = globalThis.__name || function (f) { return f; };";
      const context = page.context();
      await context.addInitScript(nameShim);
      await Promise.all(context.pages().map((p) => p.evaluate(nameShim).catch(() => {})));

      attach(page); // resolves instance.ref for every downstream action
      console.log(`attached ${from}`);

      // Daemon: hold the page open until teardown, then drop the CDP session if ours.
      return new Promise<void>((resolveRun) => {
        const stop = (): void => {
          // Bound the close: on a broken CDP connection `close()` can hang, which
          // would wedge teardown — settle after a short race regardless.
          if (owned) void Promise.race([owned.close(), delay(2000)]).finally(resolveRun);
          else resolveRun();
        };
        if (signal.aborted) stop();
        else signal.addEventListener("abort", stop, { once: true });
      });
    }
  );
