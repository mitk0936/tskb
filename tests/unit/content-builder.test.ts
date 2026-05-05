/**
 * Unit tests for content-builder utilities.
 *
 * These functions produce the body text baked into generated skill files and
 * Copilot instruction files. Tests verify structure and content — not exact
 * prose, which changes often.
 */
import { describe, it, expect } from "vitest";
import {
  buildQueryBody,
  buildUpdateBody,
  buildUpdateSyntaxBody,
} from "../../packages/tskb/src/cli/utils/content-builder.js";
import type { KnowledgeGraph } from "../../packages/tskb/src/core/graph/types.js";

function emptyGraph(overrides: Partial<KnowledgeGraph["nodes"]> = {}): KnowledgeGraph {
  return {
    nodes: {
      folders: {},
      modules: {},
      terms: {},
      exports: {},
      files: {},
      externals: {},
      flows: {},
      docs: {},
      ...overrides,
    },
    edges: [],
    metadata: {
      generatedAt: new Date().toISOString(),
      version: "0.0.0",
      rootPath: ".",
      stats: {
        folderCount: 0,
        moduleCount: 0,
        termCount: 0,
        exportCount: 0,
        fileCount: 0,
        externalCount: 0,
        flowCount: 0,
        docCount: 0,
        edgeCount: 0,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// buildQueryBody
// ---------------------------------------------------------------------------

describe("buildQueryBody", () => {
  it("includes command reference", () => {
    const body = buildQueryBody(emptyGraph());
    expect(body).toContain("tskb search");
    expect(body).toContain("tskb pick");
    expect(body).toContain("tskb context");
    expect(body).toContain("tskb ls");
    expect(body).toContain("tskb flows");
  });

  it("shows empty-state message when no folders in graph", () => {
    const body = buildQueryBody(emptyGraph());
    expect(body).toContain("No folders in graph");
  });

  it("renders folder entries with id, path and description", () => {
    const graph = emptyGraph({
      folders: {
        auth: { id: "auth", type: "folder", desc: "Auth layer", path: "src/auth" },
        api: { id: "api", type: "folder", desc: "API surface", path: "src/api" },
      },
    });
    const body = buildQueryBody(graph);
    expect(body).toContain("**auth**");
    expect(body).toContain("`src/auth`");
    expect(body).toContain("Auth layer");
    expect(body).toContain("**api**");
  });

  it("respects maxDepth — deep folders are filtered", () => {
    const graph = emptyGraph({
      folders: {
        deep: {
          id: "deep",
          type: "folder",
          desc: "Very nested",
          path: "a/b/c/d/e",
        },
        shallow: {
          id: "shallow",
          type: "folder",
          desc: "Top level",
          path: "src",
        },
      },
    });
    const body = buildQueryBody(graph);
    // buildQueryBody passes maxDepth=2 → "a/b/c/d/e" (5 segments) is excluded
    expect(body).toContain("**shallow**");
    expect(body).not.toContain("**deep**");
  });

  it("shows empty-state message when no essential docs", () => {
    const graph = emptyGraph({
      docs: {
        "supp-doc": {
          id: "supp-doc",
          type: "doc",
          explains: "Some supplementary doc",
          priority: "supplementary",
          filePath: "docs/supp.tskb.tsx",
          content: "",
          format: "tsx",
        },
      },
    });
    const body = buildQueryBody(graph);
    expect(body).toContain('priority="essential"');
  });

  it("lists essential docs and mentions supplementary count", () => {
    const graph = emptyGraph({
      docs: {
        "arch-doc": {
          id: "arch-doc",
          type: "doc",
          explains: "Overall architecture",
          priority: "essential",
          filePath: "docs/arch.tskb.tsx",
          content: "",
          format: "tsx",
        },
        "supp-doc": {
          id: "supp-doc",
          type: "doc",
          explains: "Extra context",
          priority: "supplementary",
          filePath: "docs/supp.tskb.tsx",
          content: "",
          format: "tsx",
        },
      },
    });
    const body = buildQueryBody(graph);
    expect(body).toContain("docs/arch.tskb.tsx");
    expect(body).toContain("Overall architecture");
    expect(body).toContain("1 supplementary doc");
  });

  it("omits Flows section when graph has no flows", () => {
    const body = buildQueryBody(emptyGraph());
    expect(body).not.toContain("## Flows");
  });

  it("omits Flows section when no essential/constraint flows", () => {
    const graph = emptyGraph({
      flows: {
        "supp-flow": {
          id: "supp-flow",
          type: "flow",
          desc: "Nice to know",
          priority: "supplementary",
          steps: [],
        },
      },
    });
    const body = buildQueryBody(graph);
    expect(body).not.toContain("## Flows");
  });

  it("includes Flows section for essential flows with step chain", () => {
    const graph = emptyGraph({
      flows: {
        "auth-login": {
          id: "auth-login",
          type: "flow",
          desc: "Login sequence",
          priority: "essential",
          steps: [
            { nodeId: "auth.controller", order: 0 },
            { nodeId: "auth.service", order: 1 },
          ],
        },
      },
    });
    const body = buildQueryBody(graph);
    expect(body).toContain("## Flows");
    expect(body).toContain("auth-login");
    expect(body).toContain("auth.controller → auth.service");
  });

  it("omits Externals section when graph has no externals", () => {
    const body = buildQueryBody(emptyGraph());
    expect(body).not.toContain("## Externals");
  });

  it("includes Externals section with metadata", () => {
    const graph = emptyGraph({
      externals: {
        redis: {
          id: "redis",
          type: "external",
          desc: "Session cache",
          metadata: { url: "https://redis.io", kind: "cache" },
        },
      },
    });
    const body = buildQueryBody(graph);
    expect(body).toContain("## Externals");
    expect(body).toContain("**redis**");
    expect(body).toContain("Session cache");
    expect(body).toContain("url: https://redis.io");
  });

  it("includes snapshot staleness note", () => {
    const body = buildQueryBody(emptyGraph());
    expect(body).toContain("Regenerated by");
  });
});

// ---------------------------------------------------------------------------
// buildUpdateBody
// ---------------------------------------------------------------------------

describe("buildUpdateBody", () => {
  it("includes session triggers section", () => {
    const body = buildUpdateBody(emptyGraph());
    expect(body).toContain("When to Update");
  });

  it("includes key rules section", () => {
    const body = buildUpdateBody(emptyGraph());
    expect(body).toContain("Key Rules");
  });

  it("references the high-level JSX tags users reach for", () => {
    const body = buildUpdateBody(emptyGraph());
    expect(body).toContain("<Doc");
    expect(body).toContain("<Flow");
    expect(body).toContain("<Adr");
    expect(body).toContain("<Snippet");
  });

  it("uses docs folder path from graph when available", () => {
    const graph = emptyGraph({
      folders: {
        docs: { id: "docs", type: "folder", desc: "Docs root", path: "architecture/docs" },
      },
    });
    const body = buildUpdateBody(graph);
    expect(body).toContain("architecture/docs");
  });

  it("falls back to 'docs' path when no docs folder in graph", () => {
    const body = buildUpdateBody(emptyGraph());
    expect(body).toContain("`docs/`");
  });

  it("includes the context command in the pre-check snippet", () => {
    const body = buildUpdateBody(emptyGraph());
    expect(body).toContain("tskb context");
  });

  it("includes a rebuild instruction with the detected build command", () => {
    // Pass an explicit build script so the test does not depend on the
    // surrounding workspace's package.json.
    const body = buildUpdateBody(emptyGraph(), "npm run my-docs");
    expect(body).toContain("## After Editing");
    expect(body).toContain("npm run my-docs");
  });
});

// ---------------------------------------------------------------------------
// buildUpdateSyntaxBody
// ---------------------------------------------------------------------------

describe("buildUpdateSyntaxBody", () => {
  it("includes the file anatomy and registry primitive table", () => {
    const body = buildUpdateSyntaxBody(emptyGraph());
    expect(body).toContain("File Anatomy");
    expect(body).toContain("Registry Primitives");
    expect(body).toContain("Folder<");
    expect(body).toContain("Module<");
    expect(body).toContain("Export<");
    expect(body).toContain("Term<");
  });

  it("references every JSX component including Step", () => {
    const body = buildUpdateSyntaxBody(emptyGraph());
    expect(body).toContain("<Doc");
    expect(body).toContain("<Flow");
    expect(body).toContain("<Step");
    expect(body).toContain("<Snippet");
    expect(body).toContain("<Relation");
    expect(body).toContain("<Adr");
  });

  it("documents the boundary prop and class-method pattern", () => {
    const body = buildUpdateSyntaxBody(emptyGraph());
    expect(body).toContain("boundary prop");
    expect(body).toContain("InstanceType");
  });

  it("documents type-checked snippets", () => {
    const body = buildUpdateSyntaxBody(emptyGraph());
    expect(body).toContain("Type-Checked Snippets");
    expect(body).toContain("JSON.stringify");
    expect(body).toContain("execSync");
  });
});
