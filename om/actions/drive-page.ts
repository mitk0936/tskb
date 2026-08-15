import { z } from "zod";
import { action } from "omkit";
import { drivePage as battery } from "omkit/actions";

/**
 * What driving a live page needs from its caller — all of it plain data, which is the point.
 *
 * `browser` and `chromePage` publish capability *handles*, so their input cannot be described
 * by a schema and they make poor MCP tools. Addressing the browser by its debugging port
 * instead keeps every field describable, so this one can be listed, checked, and called by
 * name from outside the repo.
 */
export const drivePageArgs = z.object({
  /** Chrome's remote-debugging endpoint. `tskb:dev` opens one on its `cdpPort`. */
  cdp: z.string().default("localhost:9222"),
  /**
   * Which open tab to drive, as a JS **expression** evaluated in each page until one is
   * truthy — `document.title.includes("Explorer")`. Omit to take the first page open.
   */
  match: z.string().optional(),
  /** Navigate the chosen tab here first. Omit to drive it where it already is. */
  url: z.string().optional(),
  /**
   * The JS to run, as an **expression**: `document.querySelectorAll("g.node").length`, not
   * `return …`. Wrap several statements in an IIFE — `(() => { …; return x })()`.
   */
  js: z.string(),
  /** Save a PNG of the page and register it as a run artifact. */
  screenshot: z.boolean().default(true),
});

/**
 * The MCP-callable face of omkit's `drivePage` battery.
 *
 * It has to be declared *here* rather than marked on the battery itself: discovery scans the
 * files in this project's `tsconfig.omkit.json`, and matches the literal
 * `export const x = action("name")` shape — so an entry inside `node_modules` is invisible to
 * it, and a bare re-export would not match either. This declaration is what puts the battery
 * on the map; the behaviour all lives in omkit.
 */
export const drivePage = action("page:drive")
  .describe({
    summary:
      "Attach to a running Chrome over CDP, run a JS expression in one of its open tabs, and report what it returned.",
  })
  .mcp()
  .args(drivePageArgs)
  .run(async (_ctx, args: z.input<typeof drivePageArgs>) => {
    // An action's `.args()` is type-level only — nothing parses it, so `.default()` would
    // never fire on its own. Parsing here is what makes the declared defaults real, and it
    // is also the only validation an action gets.
    const { cdp, match, url, js, screenshot } = drivePageArgs.parse(args ?? {});
    // The battery's `target` also accepts a live handle, which is how an om drives its own
    // browser without a network hop. Only the address form can cross a process boundary, so
    // that is all this schema offers — a caller out there has no handle to give.
    return battery({
      target: cdp,
      js,
      screenshot,
      ...(url === undefined ? {} : { url }),
      ...(match === undefined ? {} : { match: { js: match } }),
    }).result;
  });
