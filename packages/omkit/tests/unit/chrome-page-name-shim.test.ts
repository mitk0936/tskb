import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { chromePage } from "../../src/actions/chrome-page.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";

afterEach(() => {
  ExecutionTree.reset();
  process.exitCode = 0;
});

/**
 * A fake browser context holding two pages. `mainFrame` being a function is what makes omkit
 * treat the source as an existing Page handle (see `isPage`). We record what gets injected at
 * the context level and per page, so we can prove sibling tabs — reached via context.pages() —
 * are seeded too, not just the attached page.
 */
function makeEnv() {
  const ctxInit: unknown[] = [];
  const pages: unknown[] = [];
  const context = {
    addInitScript: async (script: unknown) => void ctxInit.push(script),
    pages: () => pages,
  };
  const mkPage = (url: string) => {
    const evaluate: unknown[] = [];
    const page = {
      mainFrame: () => page,
      on: () => {},
      url: () => url,
      title: async () => "t",
      goto: async () => {},
      evaluate: async (script: unknown) => void evaluate.push(script),
      addInitScript: async () => {},
      context: () => context,
      _evaluate: evaluate,
    };
    return page;
  };
  const initial = mkPage("about:blank");
  const sibling = mkPage("https://app.test/other");
  pages.push(initial, sibling);
  return { context, initial, sibling, ctxInit };
}

describe("chromePage __name shim", () => {
  test("seeds a no-op __name across the whole context — every page and future document", async () => {
    const { initial, sibling, ctxInit } = makeEnv();

    await om("shim").run(async ({ cancel }) => {
      const inst = chromePage("Test", initial as never);
      await inst.ref; // resolves once the page is attached — the shim has run by then
      cancel();
    });

    // Future documents / new tabs / frames are covered by a context-level init script.
    expect(ctxInit.some((s) => String(s).includes("__name"))).toBe(true);
    // Every already-open page is seeded — the attached one AND sibling tabs from context.pages().
    expect(initial._evaluate.some((s) => String(s).includes("__name"))).toBe(true);
    expect(sibling._evaluate.some((s) => String(s).includes("__name"))).toBe(true);
  });
});
