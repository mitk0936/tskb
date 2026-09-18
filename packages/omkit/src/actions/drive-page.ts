import path from "node:path";
import { action } from "../core/action.ts";
import { chromePage, type ChromePageSource, type Page, type PageMatch } from "./chrome-page.ts";
import type { ActionContext } from "../core/types.ts";

export interface DrivePageOptions {
  /**
   * Where the page is. Either a **CDP endpoint** (`host:port` or a URL) for a browser
   * running in another process, or a **live handle** — a `Page`, `BrowserContext`, or
   * `Browser` — published by an earlier action in this same run.
   *
   * Both matter, and for different reasons. The address form is plain data, so it can be
   * described by a schema and called from outside the process; the handle form skips the
   * network entirely when the browser is already yours, which is what an om driving its own
   * stack wants. Defaults to the endpoint `browser` opens when given a debugging port.
   */
  target?: ChromePageSource;
  /** Which open tab to drive. Omit to take the first page the browser has open. */
  match?: PageMatch;
  /** Navigate the chosen tab here first. Omit to drive it wherever it already is. */
  url?: string;
  /**
   * The JS to run in the page, as an **expression** — `document.title`, not `return …`.
   * Wrap several statements in an IIFE: `(() => { …; return x })()`. The result travels
   * back through the run's log, so it has to be JSON-serialisable.
   */
  js: string;
  /** Save a PNG of the page afterwards and register it as a run artifact. Default true. */
  screenshot?: boolean;
}

/** What {@link drivePage} reports back. */
export interface DrivePageResult {
  /** Whatever the expression evaluated to. */
  readonly value: unknown;
  readonly title: string;
  readonly url: string;
  /** Absolute path of the screenshot, when one was taken. */
  readonly screenshot?: string;
}

/** The slice of the run context the evaluation half needs. */
type DriveContext = Pick<ActionContext, "snapshot" | "artifact" | "artifactsFolder">;

/**
 * Evaluate an expression in a live page and report what came back.
 *
 * Reaches its page either way round, and that is the point. Given a **handle** it drives a
 * page an earlier action in the same run already published — the cheap path, and the one an
 * om driving its own stack should take. Given a **CDP address** it attaches to a browser in
 * another process entirely, which is what lets this action be described by a schema and
 * called by name from outside: `browser` and {@link chromePage} publish capability handles,
 * and a handle is not something a caller across a process boundary can pass.
 *
 * Nothing here is owned. `chromePage` closes only a CDP connection it opened, and closing a
 * CDP connection disconnects the client rather than stopping the browser — so this finishing,
 * failing, or being cancelled never tears down the stack it attached to, in either mode.
 */
export const drivePage = action("drivePage")
  .describe({
    summary:
      "Evaluate JS in a live page — a handle from this run, or a tab of a browser reached over CDP — and report the result.",
  })
  .run(async ({ snapshot, artifact, artifactsFolder }, opts: DrivePageOptions) => {
    const { target = "localhost:9222", match, url } = opts;

    // `chromePage` is daemon-shaped: it stays alive until something stops it, so a run that
    // only awaits its `.ref` never settles — the tree finishes while the process is still
    // held open, and the caller waits out a timeout for a run that is already done. Keep the
    // handle and release it, the same shape `tskb:build` uses for its watcher.
    const attached = chromePage("target", target, {
      ...(url === undefined ? {} : { url }),
      ...(match === undefined ? {} : { match }),
    }).tag("page:attach");

    try {
      const page = await attached.ref;
      return await evaluateIn(page, opts, { snapshot, artifact, artifactsFolder });
    } finally {
      // Releases the daemon whether the expression threw or not. Cancelling closes the CDP
      // connection, which disconnects this client and leaves the browser to its owner.
      attached.cancel();
    }
  });

/** The work itself, split out so the daemon handle above has one obvious release point. */
async function evaluateIn(
  page: Page,
  opts: DrivePageOptions,
  { snapshot, artifact, artifactsFolder }: DriveContext
): Promise<DrivePageResult> {
  const { js, screenshot = true } = opts;

  const title = await page.title();
  void snapshot("page", { title, url: page.url() });

  // Evaluated as an expression in page context. A string is sent verbatim, which is what
  // keeps it clear of the esbuild `__name` rewriting that catches serialized *functions*
  // under tsx — see the shim in chrome-page.ts.
  let value: unknown;
  try {
    value = await page.evaluate(js);
  } catch (cause) {
    // A page-side stack means little to a caller who only sent a string, so lead with the
    // expression that failed and keep the original as the cause.
    throw new Error(`the expression threw in the page: ${js}`, { cause });
  }
  void snapshot("result", { js, value });
  console.log(`result: ${JSON.stringify(value) ?? "undefined"}`);

  const result: DrivePageResult = { value, title, url: page.url() };
  if (!screenshot) return result;

  const file = path.join(artifactsFolder, "page.png");
  await page.screenshot({ path: file });
  artifact("page.png", file, { description: `The page after evaluating: ${js}` });
  return { ...result, screenshot: file };
}
