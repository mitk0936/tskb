/**
 * Tests for tskb CLI query commands: ls, search, pick, docs, flows, context.
 * Also covers JSON output mode.
 */
import { describe, it, expect } from "vitest";
import { tskb, loadGraph } from "./helpers.js";

describe("ls command", () => {
  it("should list folder structure in plain mode", () => {
    const output = tskb("ls", "--plain");
    expect(output).toContain("api");
    expect(output).toContain("services");
    expect(output).toContain("models");
  });

  it("should show essential docs", () => {
    const output = tskb("ls", "--plain");
    expect(output).toMatch(/essential/i);
  });

  it("should respect depth parameter", () => {
    const shallow = tskb("ls", "--depth", "1", "--plain");
    const deep = tskb("ls", "--depth", "4", "--plain");
    expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
  });
});

describe("search command", () => {
  it("should find nodes by keyword", () => {
    const output = tskb("search", "auth", "--plain");
    expect(output).toContain("AuthService");
  });

  it("should find terms", () => {
    const output = tskb("search", "jwt", "--plain");
    expect(output).toMatch(/jwt/i);
  });

  it("should find externals", () => {
    const output = tskb("search", "postgres", "--plain");
    expect(output).toMatch(/postgres/i);
  });

  it("should find flows", () => {
    const output = tskb("search", "auth-login", "--plain");
    expect(output).toContain("auth-login");
    expect(output).toMatch(/flow/i);
  });

  it("should return no results for garbage query", () => {
    const output = tskb("search", "xyznonexistent", "--plain");
    expect(output).not.toContain("AuthService");
  });
});

describe("pick command", () => {
  it("should pick a folder by ID", () => {
    const output = tskb("pick", "services", "--plain");
    expect(output).toContain("services");
    expect(output).toMatch(/Business logic/i);
  });

  it("should pick a folder by path", () => {
    const output = tskb("pick", "src/services", "--plain");
    expect(output).toContain("services");
  });

  it("should pick a module", () => {
    const output = tskb("pick", "services.auth", "--plain");
    expect(output).toMatch(/auth/i);
  });

  it("should pick an export", () => {
    const output = tskb("pick", "AuthService", "--plain");
    expect(output).toMatch(/AuthService/);
  });

  it("should show constraint docs when picking referenced area", () => {
    const output = tskb("pick", "services", "--plain");
    expect(output).toMatch(/constraint/i);
  });

  it("should pick an external", () => {
    const output = tskb("pick", "postgres", "--plain");
    expect(output).toMatch(/postgres/i);
    expect(output).toMatch(/database/i);
  });

  it("should pick a flow", () => {
    const output = tskb("pick", "auth-login", "--plain");
    expect(output).toContain("auth-login");
    expect(output).toMatch(/essential/i);
    expect(output).toContain("api.routes");
    expect(output).toContain("AuthService");
    expect(output).toContain("postgres");
  });

  it("should show full doc content when picking a doc", () => {
    const graph = loadGraph();
    const docIds = Object.keys(graph.nodes.docs);
    const authDocId = docIds.find((id: string) => id.includes("auth"));
    if (authDocId) {
      const output = tskb("pick", authDocId, "--plain");
      expect(output).toMatch(/Authentication/i);
    }
  });
});

describe("docs command", () => {
  it("should list all docs", () => {
    const output = tskb("docs", "--plain");
    expect(output).toMatch(/architecture/i);
    expect(output).toMatch(/auth/i);
    expect(output).toMatch(/constraint/i);
  });

  it("should search docs by query", () => {
    const output = tskb("docs", "authentication", "--plain");
    expect(output).toMatch(/auth/i);
  });

  it("should show priority in results", () => {
    const output = tskb("docs", "--plain");
    expect(output).toMatch(/essential/i);
    expect(output).toMatch(/constraint/i);
  });
});

describe("flows command", () => {
  it("should list all flows", () => {
    const output = tskb("flows", "--plain");
    expect(output).toContain("auth-login");
    expect(output).toMatch(/essential/i);
  });

  it("should show flow steps in order", () => {
    const output = tskb("flows", "--plain");
    expect(output).toMatch(/api\.routes.*→.*AuthService.*→.*postgres/i);
  });

  it("should search flows by query", () => {
    const output = tskb("flows", "login", "--plain");
    expect(output).toContain("auth-login");
  });

  it("should return no results for unmatched query", () => {
    const output = tskb("flows", "zzz_nonexistent_zzz", "--plain");
    expect(output).toMatch(/0 results/);
  });

  it("should output valid JSON", () => {
    const raw = tskb("flows");
    expect(() => JSON.parse(raw)).not.toThrow();
    const result = JSON.parse(raw);
    expect(result.flows).toBeDefined();
    expect(result.flows.length).toBe(1);
    expect(result.flows[0].nodeId).toBe("auth-login");
    expect(result.flows[0].steps.length).toBe(3);
  });
});

describe("context command", () => {
  it("should return node and neighborhood", () => {
    const output = tskb("context", "services", "--plain");
    expect(output).toContain("services");
    expect(output).toMatch(/auth/i);
  });

  it("should include referencing docs", () => {
    const output = tskb("context", "services", "--plain");
    expect(output).toMatch(/constraint/i);
  });

  it("should respect depth parameter", () => {
    const shallow = tskb("context", "services", "--depth", "1", "--plain");
    const deep = tskb("context", "services", "--depth", "2", "--plain");
    expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
  });

  it("should discover flows connected to a step participant", () => {
    const output = tskb("context", "AuthService", "--depth", "2", "--plain");
    expect(output).toContain("auth-login");
  });
});

describe("registry command", () => {
  it("should show an overview with all six kinds and total count", () => {
    const output = tskb("registry", "--plain");
    expect(output).toMatch(/Registry overview: \d+ nodes/);
    expect(output).toMatch(/folders: \d+/);
    expect(output).toMatch(/modules: \d+/);
    expect(output).toMatch(/exports: \d+/);
    expect(output).toMatch(/files: \d+/);
    expect(output).toMatch(/externals: \d+/);
    expect(output).toMatch(/terms: \d+/);
  });

  it("should hint at --type for kinds with more than the sample size", () => {
    const output = tskb("registry", "--plain");
    // exports has 10 in the fixture, well above SAMPLE_SIZE (5)
    expect(output).toMatch(/use --type=export to list all/);
  });

  it("should list all nodes of a kind when --type is given", () => {
    const output = tskb("registry", "--type=term", "--plain");
    expect(output).toMatch(/Registry: \d+ nodes — terms/);
    expect(output).toContain("jwt");
    expect(output).toContain("rbac");
    expect(output).toContain("task-workflow");
  });

  it("should list externals scoped to that kind only", () => {
    const output = tskb("registry", "--type=external", "--plain");
    expect(output).toContain("postgres");
    expect(output).not.toContain("AuthService");
  });

  it("should list externals alphabetically regardless of declaration order", () => {
    // mailgun is declared after postgres in the fixture's vocabulary.tskb.tsx;
    // alphabetical order must put mailgun first.
    const output = tskb("registry", "--type=external", "--plain");
    const mailgunIdx = output.indexOf("mailgun");
    const postgresIdx = output.indexOf("postgres");
    expect(mailgunIdx).toBeGreaterThan(-1);
    expect(postgresIdx).toBeGreaterThan(-1);
    expect(mailgunIdx).toBeLessThan(postgresIdx);
  });

  it("should list modules with their resolved paths", () => {
    const output = tskb("registry", "--type=module", "--plain");
    expect(output).toContain("services.auth");
    expect(output).toMatch(/services\/auth/);
  });

  it("should fuzzy-search across kinds with a positional query", () => {
    const output = tskb("registry", "auth", "--plain");
    expect(output).toMatch(/matching "auth"/);
    expect(output).toContain("AuthService");
    expect(output).toContain("services.auth");
  });

  it("should match a query against external metadata", () => {
    const output = tskb("registry", "postgres", "--plain");
    expect(output).toContain("postgres");
    expect(output).toMatch(/\(external\)/);
  });

  it("should scope fuzzy search when both query and --type are given", () => {
    const output = tskb("registry", "auth", "--type=module", "--plain");
    expect(output).toContain("services.auth");
    // AuthService (and its methods) are exports, not modules — must be filtered out
    expect(output).not.toMatch(/AuthService\b.*\(export\)/);
  });

  it("should return zero matches for a garbage query", () => {
    const output = tskb("registry", "xyznonexistent_zzz", "--plain");
    expect(output).toMatch(/Registry: 0 nodes/);
  });

  it("should reject an invalid --type", () => {
    expect(() => tskb("registry", "--type=banana", "--plain")).toThrow();
  });

  it("should output valid overview JSON with counts and samples", () => {
    const raw = tskb("registry");
    const result = JSON.parse(raw);
    expect(result.counts).toBeDefined();
    expect(result.samples).toBeDefined();
    for (const kind of ["folder", "module", "export", "file", "external", "term"]) {
      expect(typeof result.counts[kind]).toBe("number");
      expect(Array.isArray(result.samples[kind])).toBe(true);
    }
  });

  it("should output valid filtered JSON with a node list", () => {
    const raw = tskb("registry", "--type=term");
    const result = JSON.parse(raw);
    expect(result.type).toBe("term");
    expect(Array.isArray(result.nodes)).toBe(true);
    const ids = result.nodes.map((n: { nodeId: string }) => n.nodeId);
    expect(ids).toContain("jwt");
    expect(ids).toContain("rbac");
    expect(ids).toContain("task-workflow");
    for (const node of result.nodes) {
      expect(node.kind).toBe("term");
    }
  });

  it("should output valid query JSON with scored results", () => {
    const raw = tskb("registry", "auth");
    const result = JSON.parse(raw);
    expect(result.query).toBe("auth");
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(result.nodes.length).toBeGreaterThan(0);
    for (const node of result.nodes) {
      expect(typeof node.score).toBe("number");
      expect(node.score).toBeGreaterThan(0);
    }
  });
});

describe("class morphology", () => {
  it("should include private methods in class stubs", () => {
    const output = tskb("pick", "services.auth", "--plain");
    expect(output).toContain("hashPassword");
    expect(output).toContain("generateTokens");
  });

  it("should show private modifier on private methods", () => {
    const output = tskb("pick", "services.auth", "--plain");
    expect(output).toMatch(/private.*hashPassword/);
    expect(output).toMatch(/private.*generateTokens/);
  });
});

describe("JSON output mode", () => {
  it("should output valid JSON from search", () => {
    const raw = tskb("search", "auth");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("should output valid JSON from pick", () => {
    const raw = tskb("pick", "services");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("should output valid JSON from ls", () => {
    const raw = tskb("ls");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("should output valid JSON from docs", () => {
    const raw = tskb("docs");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("should output valid JSON from context", () => {
    const raw = tskb("context", "services");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
