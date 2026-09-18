import { describe, it, expect } from "vitest";
import { shortNodeLabel } from "../../explorer-app/src/router/components/NodeLabel.js";

describe("shortNodeLabel", () => {
  it("shortens a module path to its file name", () => {
    expect(shortNodeLabel("module", "packages/tskb/explorer-app/src/router/Router.ts")).toBe(
      "Router.ts"
    );
  });

  it("keeps the parent folder for index files", () => {
    expect(shortNodeLabel("module", "packages/tskb/explorer-app/src/router/index.ts")).toBe(
      "router/index.ts"
    );
    expect(shortNodeLabel("module", "src/index.tsx")).toBe("src/index.tsx");
  });

  it("shortens a file path to its file name", () => {
    expect(shortNodeLabel("file", "packages/tskb/README.md")).toBe("README.md");
  });

  it("shortens a folder path to its name with a trailing slash", () => {
    expect(shortNodeLabel("folder", "packages/tskb/explorer-app/src/router/views")).toBe("views/");
    expect(shortNodeLabel("folder", "packages/tskb/explorer-app/src/router/views/")).toBe("views/");
  });

  it("leaves root-level and path-less displays alone", () => {
    expect(shortNodeLabel("module", "vitest.config.ts")).toBe("vitest.config.ts");
    expect(shortNodeLabel("module", "explorer.spa.router")).toBe("explorer.spa.router");
    expect(shortNodeLabel("folder", ".")).toBe(".");
    expect(shortNodeLabel("folder", "docs")).toBe("docs/");
  });

  it("passes other kinds through unchanged", () => {
    expect(shortNodeLabel("export", "explorer.spa.Router")).toBe("explorer.spa.Router");
    expect(shortNodeLabel("term", "cli")).toBe("cli");
    expect(shortNodeLabel("external", "vite")).toBe("vite");
    expect(shortNodeLabel(null, "a/b/c.ts")).toBe("a/b/c.ts");
    expect(shortNodeLabel(undefined, "whatever")).toBe("whatever");
  });
});
