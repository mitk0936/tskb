/**
 * Tests for `tskb build` output — graph structure, node counts, priorities, edges.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { FIXTURE_DIR, GRAPH_PATH, loadGraph } from "./helpers.js";
import path from "node:path";

describe("build output", () => {
  it("should create graph.json", () => {
    expect(fs.existsSync(GRAPH_PATH)).toBe(true);
  });

  it("should create graph.dot", () => {
    expect(fs.existsSync(path.join(FIXTURE_DIR, ".tskb", "graph.dot"))).toBe(true);
  });

  it("should produce a valid graph with expected node counts", () => {
    const graph = loadGraph();

    expect(graph).toHaveProperty("nodes");
    expect(graph).toHaveProperty("edges");
    expect(graph).toHaveProperty("metadata");

    // Folders: api, services, models, utils + auto-inferred root + src
    expect(Object.keys(graph.nodes.folders).length).toBeGreaterThanOrEqual(4);

    // Modules: 6 declared (including utils barrel that shares ID with utils folder)
    expect(Object.keys(graph.nodes.modules).length).toBe(6);

    // Exports: 4 declared (AuthService, TaskService, ProjectService, createLogger)
    expect(Object.keys(graph.nodes.exports).length).toBeGreaterThanOrEqual(4);

    // Terms: 3 declared
    expect(Object.keys(graph.nodes.terms).length).toBe(3);

    // Docs: 5 files (vocabulary has no Doc, so 4 with Doc exports)
    expect(Object.keys(graph.nodes.docs).length).toBe(4);

    // Flows: 1 declared (auth-login)
    const flowIds = Object.keys(graph.nodes.flows);
    expect(flowIds.length).toBe(1);
    expect(flowIds).toContain("auth-login");

    // Edges exist
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("should have correct doc priorities", () => {
    const graph = loadGraph();
    const docs = Object.values(graph.nodes.docs) as Array<{
      priority: string;
      explains: string;
    }>;

    const essential = docs.filter((d) => d.priority === "essential");
    const constraint = docs.filter((d) => d.priority === "constraint");
    const supplementary = docs.filter((d) => d.priority === "supplementary");

    expect(essential.length).toBe(2); // architecture + auth
    expect(constraint.length).toBe(1); // service isolation
    expect(supplementary.length).toBe(1); // tasks
  });

  it("should have related-to edges from Relation components", () => {
    const graph = loadGraph();
    const relatedEdges = graph.edges.filter((e: { type: string }) => e.type === "related-to");
    expect(relatedEdges.length).toBeGreaterThanOrEqual(3);

    const labels = relatedEdges.map((e: { label?: string }) => e.label).filter(Boolean);
    expect(labels).toContain("delegates to");
    expect(labels).toContain("persists to");
  });
});
