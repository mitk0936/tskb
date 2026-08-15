import { describe, it, expect } from "vitest";
import { selectPage } from "../../src/actions/chrome-page.ts";
import type { Page } from "playwright-core";

/**
 * A stand-in for a live page. `selectPage` only ever calls `url()` and `evaluate()`, so a
 * fake keeps these tests free of a real browser — the CDP round trip is covered by driving
 * the actual explorer, not here.
 */
const fakePage = (url: string, evaluate?: (js: string) => unknown): Page =>
  ({
    url: () => url,
    evaluate: (js: string) => {
      if (!evaluate) throw new Error("this page cannot evaluate");
      return Promise.resolve(evaluate(js));
    },
  }) as unknown as Page;

describe("selectPage — by URL", () => {
  const pages = [fakePage("http://localhost:9876/"), fakePage("https://example.com/docs")];

  it("finds a page by URL substring", async () => {
    await expect(selectPage(pages, "example.com")).resolves.toBe(pages[1]);
  });

  it("finds a page by regex", async () => {
    await expect(selectPage(pages, /localhost:\d+/)).resolves.toBe(pages[0]);
  });

  it("takes the first of several matches", async () => {
    const many = [fakePage("http://a/x"), fakePage("http://b/x")];
    await expect(selectPage(many, "/x")).resolves.toBe(many[0]);
  });

  it("lists what was open when nothing matches", async () => {
    await expect(selectPage(pages, "nope")).rejects.toThrow(/localhost:9876[\s\S]*example\.com/);
  });

  it("says so plainly when no pages are open at all", async () => {
    await expect(selectPage([], "anything")).rejects.toThrow(/no pages are open/);
  });
});

describe("selectPage — by page predicate", () => {
  it("selects the page whose predicate is truthy", async () => {
    const wrong = fakePage("http://localhost:9876/", () => false);
    const right = fakePage("http://localhost:9876/", () => true);
    await expect(selectPage([wrong, right], { js: "document.title" })).resolves.toBe(right);
  });

  it("passes the expression through to the page", async () => {
    const seen: string[] = [];
    const page = fakePage("http://x/", (js) => {
      seen.push(js);
      return true;
    });
    await selectPage([page], { js: "document.title.includes('Explorer')" });
    expect(seen).toEqual(["document.title.includes('Explorer')"]);
  });

  it("stops at the first hit rather than touching later pages", async () => {
    const touched: string[] = [];
    const first = fakePage("http://first/", () => (touched.push("first"), true));
    const second = fakePage("http://second/", () => (touched.push("second"), true));
    await selectPage([first, second], { js: "true" });
    expect(touched).toEqual(["first"]);
  });

  it("treats a throwing predicate as no-match and keeps looking", async () => {
    const hostile = fakePage("chrome://settings");
    const good = fakePage("http://localhost:9876/", () => true);
    await expect(selectPage([hostile, good], { js: "document.title" })).resolves.toBe(good);
  });

  it("reports the pages the predicate threw on when nothing matches", async () => {
    const hostile = fakePage("chrome://settings");
    const err = await selectPage([hostile], { js: "document.title" }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/The predicate threw on:[\s\S]*chrome:\/\/settings/);
  });

  it("quotes the expression that found nothing", async () => {
    const page = fakePage("http://x/", () => false);
    await expect(selectPage([page], { js: "window.ready" })).rejects.toThrow(/`window\.ready`/);
  });

  it("treats any truthy value as a match, not just true", async () => {
    const page = fakePage("http://x/", () => "TSKB Explorer");
    await expect(selectPage([page], { js: "document.title" })).resolves.toBe(page);
  });
});
