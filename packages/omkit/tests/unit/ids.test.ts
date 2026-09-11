import { describe, it, expect } from "vitest";
import { makeId, omHash, shortId } from "../../src/foundation/ids.ts";

const UUID = "3721457f-1c2d-4e5a-8b9c-0d1e2f3a4b5c";

describe("makeId", () => {
  it("reads as name plus the short uuid", () => {
    expect(makeId("chromePage", UUID)).toBe("chromePage_3721457f");
  });

  it("keeps an id to one path segment, whatever the name contains", () => {
    // A command node is named after its command line, separators and all. Ids are joined
    // with `/` into node paths and mapped onto file paths, so a separator surviving here
    // becomes a real directory — nine of them, for this exact command.
    const id = makeId(
      'npx --no -- tskb "./docs/**/*.tskb.tsx" --tsconfig ./docs/tsconfig.json',
      UUID
    );
    expect(id).not.toMatch(/[/\\]/);
    expect(id.endsWith("_3721457f")).toBe(true);
  });

  it("still separates two nodes that share a name", () => {
    const other = "9c8b7a6d-1c2d-4e5a-8b9c-0d1e2f3a4b5c";
    expect(makeId("build", UUID)).not.toBe(makeId("build", other));
  });

  it("caps a long name, since the id ends up inside a file path", () => {
    const id = makeId("x".repeat(300), UUID);
    expect(id.length).toBeLessThanOrEqual(64 + 1 + 8);
  });

  it("does not leave a trailing separator where the cut landed", () => {
    // 63 characters, so the 64th — the one the cap keeps — is the separator.
    const id = makeId(`${"a".repeat(63)} tail`, UUID);
    expect(id).toBe(`${"a".repeat(63)}_3721457f`);
  });

  it("keeps colons out of ids, the case that first forced sanitising", () => {
    expect(makeId("TSKB:root:watch:docs", UUID)).toBe("TSKB-root-watch-docs_3721457f");
  });
});

describe("shortId", () => {
  it("is the first 8 hex of the uuid", () => {
    expect(shortId(UUID)).toBe("3721457f");
  });
});

describe("omHash", () => {
  it("is stable for one file and name, and diverges across files", () => {
    expect(omHash("dev", "/a/om.ts")).toBe(omHash("dev", "/a/om.ts"));
    expect(omHash("dev", "/a/om.ts")).not.toBe(omHash("dev", "/b/om.ts"));
  });
});
