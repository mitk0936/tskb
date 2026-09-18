import { describe, it, expect } from "vitest";
import { readSearchQuery, withSearchQuery } from "../../explorer-app/src/ui/search-url.js";

describe("readSearchQuery", () => {
  it("returns the q param", () => {
    expect(readSearchQuery("?q=router%20hash")).toBe("router hash");
  });

  it("returns null when q is absent or blank", () => {
    expect(readSearchQuery("")).toBeNull();
    expect(readSearchQuery("?other=1")).toBeNull();
    expect(readSearchQuery("?q=")).toBeNull();
    expect(readSearchQuery("?q=%20%20")).toBeNull();
  });

  it("trims the query", () => {
    expect(readSearchQuery("?q=%20Router.ts%20")).toBe("Router.ts");
  });
});

describe("withSearchQuery", () => {
  const base = "http://localhost:9876/";

  it("adds q while keeping the hash", () => {
    expect(withSearchQuery(`${base}#/refs/x/docs`, "router hash")).toBe(
      `${base}?q=router+hash#/refs/x/docs`
    );
  });

  it("replaces an existing q and keeps other params", () => {
    expect(withSearchQuery(`${base}?a=1&q=old#/h`, "new")).toBe(`${base}?a=1&q=new#/h`);
  });

  it("removes q when the query is null or blank", () => {
    expect(withSearchQuery(`${base}?q=old#/h`, null)).toBe(`${base}#/h`);
    expect(withSearchQuery(`${base}?a=1&q=old`, "  ")).toBe(`${base}?a=1`);
  });

  it("is a no-op when nothing changes", () => {
    expect(withSearchQuery(`${base}?q=same`, "same")).toBe(`${base}?q=same`);
    expect(withSearchQuery(base, null)).toBe(base);
  });
});
