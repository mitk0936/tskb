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

/**
 * How to pick one page out of the several a browser may have open.
 *
 * A plain string or regex tests the URL, which costs nothing and touches no page. A
 * `{ js }` predicate is **evaluated inside each page** until one returns something truthy,
 * which is the only way to select on things a URL cannot express — the document's title, a
 * rendered element, whether the app has finished booting.
 *
 * The predicate is a JS **expression**, not a function body: `document.title.includes("x")`,
 * not `return document.title…`. Wrap multiple statements in an IIFE when you need them.
 * Keep it pure — it runs against pages that turn out not to match.
 */
export type PageMatch = string | RegExp | { js: string };

export interface ChromePageOptions {
  /** Navigate the attached page here once acquired. Omit to drive it as-is. */
  url?: string;
  /**
   * Attach to a page **already open** in the target. Without it the action takes the first
   * page it finds, or opens a fresh one when {@link ChromePageOptions.url} is set — neither
   * is what you want when reattaching to a browser someone else is driving.
   *
   * No match is an error, not a silent new tab: asking for a specific page and quietly
   * getting a blank one hides the failure until something downstream reads the wrong
   * document.
   */
  match?: PageMatch;
}

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const isPage = (x: object): x is Page => typeof (x as Page).mainFrame === "function";
const isBrowser = (x: object): x is Browser => typeof (x as Browser).contexts === "function";

/** Take the first existing page of a context, or open one. */
const pageOf = (context: BrowserContext, fresh: boolean): Promise<Page> | Page =>
  fresh ? context.newPage() : (context.pages()[0] ?? context.newPage());

/** Every page open across every context — a reattached browser may have more than one. */
export const pagesOf = (browser: Browser): Page[] => browser.contexts().flatMap((c) => c.pages());

/**
 * Find the one open page a {@link PageMatch} selects, or explain what was open instead.
 *
 * Listing the candidates matters more here than anywhere else in this action: the caller is
 * attaching to a browser they did not launch, so "no match" is nearly always a stale URL or a
 * predicate written against the wrong page — and both are obvious the moment you can see what
 * was actually there.
 *
 * A predicate that throws (a chrome:// page, a document still loading, a cross-origin frame)
 * counts as "did not match" rather than failing the search, but is reported, because a
 * predicate that threw on every page is a very different problem from one that simply found
 * nothing.
 */
export async function selectPage(pages: readonly Page[], match: PageMatch): Promise<Page> {
  const describe = (): string =>
    pages.length ? pages.map((p) => `  ${p.url()}`).join("\n") : "  (no pages are open)";

  if (typeof match === "string" || match instanceof RegExp) {
    const hit = pages.find((p) =>
      typeof match === "string" ? p.url().includes(match) : match.test(p.url())
    );
    if (hit) return hit;
    throw new Error(`no open page matched ${String(match)}. Open pages:\n${describe()}`);
  }

  // Sequential, not parallel: stopping at the first hit keeps the predicate off pages it
  // never needed to touch, which matters because it is someone else's live browser.
  const threw: string[] = [];
  for (const page of pages) {
    try {
      if (await page.evaluate(match.js)) return page;
    } catch (e) {
      threw.push(`  ${page.url()} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const errors = threw.length ? `\nThe predicate threw on:\n${threw.join("\n")}` : "";
  throw new Error(`no open page satisfied \`${match.js}\`. Open pages:\n${describe()}${errors}`);
}

/** Where a page came from, and whether this action owes it a `close()` on teardown. */
interface Acquired {
  readonly page: Page;
  /** Human-readable origin, for the log line. */
  readonly from: string;
  /** Set only for a CDP connection opened here — the one thing this action may close. */
  readonly owned?: Browser;
}

/**
 * Resolve a {@link ChromePageSource} down to one live page.
 *
 * With `match` the page must already exist and is searched for across **every** context: a
 * reattached browser belongs to someone else, and nothing says the page you want lives in the
 * context we would otherwise default to. Without `match` the old behaviour stands — take the
 * first page, or open a fresh one when navigating.
 */
async function acquire(source: ChromePageSource, opts: ChromePageOptions): Promise<Acquired> {
  const { url, match } = opts;
  const fresh = url !== undefined;

  if (typeof source === "string") {
    const cdpUrl = source.includes("://") ? source : `http://${source}`;
    let owned: Browser;
    try {
      owned = await chromium.connectOverCDP(cdpUrl);
    } catch (cause) {
      throw new Error(`could not connect to Chrome over CDP at ${cdpUrl}`, { cause });
    }
    const page = match
      ? await selectPage(pagesOf(owned), match)
      : await pageOf(owned.contexts()[0] ?? (await owned.newContext()), fresh);
    return { page, from: cdpUrl, owned };
  }

  if (isPage(source)) return { page: source, from: "page handle" };

  if (isBrowser(source)) {
    const page = match
      ? await selectPage(pagesOf(source), match)
      : await pageOf(source.contexts()[0] ?? (await source.newContext()), fresh);
    return { page, from: "browser handle" };
  }

  const page = match ? await selectPage(source.pages(), match) : await pageOf(source, fresh);
  return { page, from: "context handle" };
}

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
      // With both `match` and `url`, acquire finds the existing page and this navigates it —
      // "go to that tab, then send it here" rather than opening a second one.
      const { page, from, owned } = await acquire(source, opts);

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
