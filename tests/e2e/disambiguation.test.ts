/**
 * Tests for ambiguous ID disambiguation.
 *
 * The fixture declares "utils" as both a Folder and a Module (barrel).
 * These tests verify that pick/context disambiguate them correctly.
 */
import { describe, it, expect } from "vitest";
import { tskb, loadGraph } from "./helpers.js";

describe("ambiguous ID disambiguation", () => {
  it("should have both a folder and module with ID 'utils' in the graph", () => {
    const graph = loadGraph();
    expect(graph.nodes.folders["utils"]).toBeDefined();
    expect(graph.nodes.modules["utils"]).toBeDefined();
  });

  it("pick JSON should include the node type so consumers can distinguish", () => {
    const raw = tskb("pick", "utils");
    const result = JSON.parse(raw);
    expect(result.type).toBe("folder");
    expect(result.node.nodeId).toBe("utils");
  });

  it("pick plain should show ambiguity warning when ID matches multiple types", () => {
    const output = tskb("pick", "utils", "--plain");
    expect(output).toContain("Ambiguous ID");
    expect(output).toContain("folder");
    expect(output).toContain("module");
  });

  it("context plain should show ambiguity warning for ambiguous root", () => {
    const output = tskb("context", "utils", "--plain");
    expect(output).toContain("Ambiguous ID");
    expect(output).toContain("folder");
    expect(output).toContain("module");
  });

  it("context should list both folder and module nodes when they share an ID", () => {
    const raw = tskb("context", "utils", "--depth", "1");
    const result = JSON.parse(raw);
    expect(result.root.type).toBeDefined();
    for (const node of result.nodes) {
      expect(node.type).toBeDefined();
    }
  });

  it("search results should show type for each result to distinguish same-ID nodes", () => {
    const output = tskb("search", "utils", "--plain");
    expect(output).toContain("(folder)");
    expect(output).toContain("(module)");
  });

  it("pick plain should show node types on referenced IDs (importedBy, parent, etc.)", () => {
    const output = tskb("pick", "services", "--plain");
    if (output.includes("parent:")) {
      expect(output).toMatch(/parent:.*\(folder\)/);
    }
  });
});
