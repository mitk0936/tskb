import { action } from "omkit";
import type { Page } from "omkit/actions";

/**
 * A downstream action that knows nothing about how the browser was launched — it
 * just awaits a {@link Page} handle and reads from the live page. Pairs with
 * omkit's `chromePage` by taking its `.ref`, proving the handle hand-off: the same
 * live page another action attached is what gets inspected here. The seed of
 * richer simulate/assert steps.
 */
export const inspectPage = action("inspectPage").run(async (_ctx, pageRef: Page) => {
  const page = await pageRef;
  const title = await page.title();
  console.log(`title: ${title}`);
  console.log(`url:   ${page.url()}`);
});
