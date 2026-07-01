import { action } from "omkit";
import type { Page } from "omkit/actions";

/**
 * A downstream action that knows nothing about how the browser was launched — it
 * just awaits a {@link Page} handle and reads from the live page. Pairs with
 * omkit's `chromePage` by taking its `.ref`, proving the handle hand-off: the same
 * live page another action attached is what gets inspected here. The seed of
 * richer simulate/assert steps.
 */
export const inspectPage = action("Inspect").run(async ({ logs }, pageRef: Promise<Page>) => {
  const page = await pageRef;
  const title = await page.title();
  logs.append({ source: "Inspect", level: "info", message: `title: ${title}` });
  logs.append({ source: "Inspect", level: "info", message: `url:   ${page.url()}` });
});
