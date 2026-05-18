/**
 * Tests for knowledge graph structural integrity.
 *
 * Validates edges, type signatures, and node relationships.
 */
import { describe, it, expect } from "vitest";
import { loadGraph } from "./helpers.js";

describe("graph integrity", () => {
  it("should have belongs-to edges for modules in folders", () => {
    const graph = loadGraph();
    const belongsTo = graph.edges.filter((e: { type: string }) => e.type === "belongs-to");
    expect(belongsTo.length).toBeGreaterThan(0);

    const authBelongs = belongsTo.find(
      (e: { from: string; to: string }) => e.from === "services.auth" && e.to === "services"
    );
    expect(authBelongs).toBeDefined();
  });

  it("should have contains edges between folders", () => {
    const graph = loadGraph();
    const contains = graph.edges.filter((e: { type: string }) => e.type === "contains");
    expect(contains.length).toBeGreaterThan(0);
  });

  it("should have references edges from docs to nodes", () => {
    const graph = loadGraph();
    const references = graph.edges.filter((e: { type: string }) => e.type === "references");
    expect(references.length).toBeGreaterThan(0);
  });

  it("should have imports edges between modules (if any cross-import)", () => {
    const graph = loadGraph();
    const imports = graph.edges.filter((e: { type: string }) => e.type === "imports");
    expect(imports.length).toBeGreaterThanOrEqual(0);
  });

  it("should resolve module type signatures", () => {
    const graph = loadGraph();
    const authModule = graph.nodes.modules["services.auth"];
    expect(authModule).toBeDefined();
    expect(authModule.typeSignature).toBeDefined();
    expect(authModule.typeSignature).toContain("auth.service");
  });

  it("should resolve export type signatures", () => {
    const graph = loadGraph();
    const authExport = graph.nodes.exports["AuthService"];
    expect(authExport).toBeDefined();
    expect(authExport.typeSignature).toBeDefined();
    expect(authExport.typeSignature).toContain("AuthService");
  });

  it("should record external metadata", () => {
    const graph = loadGraph();
    const postgres = graph.nodes.externals?.["postgres"];
    expect(postgres).toBeDefined();
    expect(postgres.desc).toContain("database");
  });

  it("should have flow-step edges for flows", () => {
    const graph = loadGraph();
    const flowStepEdges = graph.edges.filter((e: { type: string }) => e.type === "flow-step");
    // auth-login flow has 3 steps
    expect(flowStepEdges.length).toBe(3);

    // All flow-step edges originate from the flow node
    const fromIds = new Set(flowStepEdges.map((e: { from: string }) => e.from));
    expect(fromIds.has("auth-login")).toBe(true);
    expect(fromIds.size).toBe(1);

    // Steps point to the correct nodes in order
    const sortedSteps = flowStepEdges.sort(
      (a: { order: number }, b: { order: number }) => a.order - b.order
    );
    expect(sortedSteps[0].to).toBe("api.routes");
    expect(sortedSteps[1].to).toBe("AuthService");
    expect(sortedSteps[2].to).toBe("postgres");
  });

  it("should store flow node with correct structure", () => {
    const graph = loadGraph();
    const flow = graph.nodes.flows["auth-login"];
    expect(flow).toBeDefined();
    expect(flow.type).toBe("flow");
    expect(flow.desc).toContain("Login request");
    expect(flow.priority).toBe("essential");
    expect(flow.steps).toHaveLength(3);
    expect(flow.steps[0].nodeId).toBe("api.routes");
    expect(flow.steps[1].nodeId).toBe("AuthService");
    expect(flow.steps[2].nodeId).toBe("postgres");
  });

  it("all edge targets should reference existing nodes", () => {
    const graph = loadGraph();
    const allNodeIds = new Set([
      ...Object.keys(graph.nodes.folders),
      ...Object.keys(graph.nodes.modules),
      ...Object.keys(graph.nodes.exports),
      ...Object.keys(graph.nodes.files ?? {}),
      ...Object.keys(graph.nodes.terms),
      ...Object.keys(graph.nodes.docs),
      ...Object.keys(graph.nodes.externals ?? {}),
      ...Object.keys(graph.nodes.flows ?? {}),
    ]);

    for (const edge of graph.edges) {
      expect(allNodeIds.has(edge.from), `Edge 'from' not found: ${edge.from}`).toBe(true);
      expect(allNodeIds.has(edge.to), `Edge 'to' not found: ${edge.to}`).toBe(true);
    }
  });
});

describe("InstanceType method export extraction", () => {
  it("extracts method exports declared with InstanceType<X>['method'] pattern", () => {
    const graph = loadGraph();
    const loginExport = graph.nodes.exports["AuthService.login"];
    expect(loginExport, "AuthService.login export should exist in graph").toBeDefined();
    expect(loginExport.type).toBe("export");
    expect(loginExport.desc).toContain("Authenticates");
  });

  it("extracts all four AuthService method exports", () => {
    const graph = loadGraph();
    const methods = [
      "AuthService.login",
      "AuthService.register",
      "AuthService.refreshToken",
      "AuthService.logout",
    ];
    for (const id of methods) {
      expect(graph.nodes.exports[id], `${id} should be in graph`).toBeDefined();
    }
  });

  it("creates belongs-to edges from method exports to the parent module", () => {
    const graph = loadGraph();
    // Method exports belong to the same module as their class export (services.auth)
    const belongsToEdges = graph.edges.filter(
      (e: { type: string; to: string }) => e.type === "belongs-to" && e.to === "services.auth"
    );
    const memberIds = belongsToEdges.map((e: { from: string }) => e.from);
    expect(memberIds).toContain("AuthService.login");
    expect(memberIds).toContain("AuthService.register");
    expect(memberIds).toContain("AuthService.refreshToken");
    expect(memberIds).toContain("AuthService.logout");
  });

  it("sets ownerExportId on method exports pointing to the class export", () => {
    const graph = loadGraph();
    const methods = [
      "AuthService.login",
      "AuthService.register",
      "AuthService.refreshToken",
      "AuthService.logout",
    ];
    for (const id of methods) {
      expect(graph.nodes.exports[id].ownerExportId, `${id} should have ownerExportId`).toBe(
        "AuthService"
      );
    }
  });

  it("method exports have a resolved type signature from the InstanceType pattern", () => {
    const graph = loadGraph();
    const loginExport = graph.nodes.exports["AuthService.login"];
    // Should have a type signature derived from the actual method type
    expect(loginExport.typeSignature).toBeDefined();
    expect(loginExport.typeSignature.length).toBeGreaterThan(0);
  });

  it("method exports without a class export still get belongs-to edges to the parent module", () => {
    const graph = loadGraph();
    // NotificationService has method exports but NO class export registered
    const sendEmail = graph.nodes.exports["NotificationService.sendEmail"];
    const sendPush = graph.nodes.exports["NotificationService.sendPush"];
    expect(sendEmail, "NotificationService.sendEmail should exist").toBeDefined();
    expect(sendPush, "NotificationService.sendPush should exist").toBeDefined();

    // They should belong to the services.notification module via path-based matching
    const belongsToEdges = graph.edges.filter(
      (e: { type: string; to: string }) =>
        e.type === "belongs-to" && e.to === "services.notification"
    );
    const memberIds = belongsToEdges.map((e: { from: string }) => e.from);
    expect(memberIds).toContain("NotificationService.sendEmail");
    expect(memberIds).toContain("NotificationService.sendPush");
  });

  it("method exports without a class export have resolvedPath set", () => {
    const graph = loadGraph();
    const sendEmail = graph.nodes.exports["NotificationService.sendEmail"];
    expect(sendEmail.resolvedPath).toBeDefined();
    expect(sendEmail.resolvedPath).toContain("notification.service");
  });
});
