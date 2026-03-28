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
