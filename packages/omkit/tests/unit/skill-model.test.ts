import { describe, it, expect } from "vitest";
import path from "node:path";
import { buildSkillModel } from "../../src/skill/model.ts";
import type { JsonSchema } from "../../src/core/schema-json.ts";
import type {
  ActionRegistration,
  OmRegistration,
  Registry,
  RegistrationSet,
} from "../../src/client/registry.ts";

const ROOT = path.resolve("/proj");
const at = (rel: string): string => path.join(ROOT, rel);
const BUILD = "om/build.ts";

const set = (over: Partial<RegistrationSet> = {}): RegistrationSet => ({
  oms: [],
  actions: [],
  warnings: [],
  ...over,
});
const reg = (over: Partial<Registry> = {}): Registry => ({
  oms: [],
  actions: [],
  warnings: [],
  ...over,
});

const om = (name: string, over: Partial<OmRegistration> = {}): OmRegistration => ({
  name,
  file: at(BUILD),
  folderName: `${name}-abcd1234`,
  mcp: { mode: "settling" },
  ...over,
});
const action = (name: string, over: Partial<ActionRegistration> = {}): ActionRegistration => ({
  name,
  file: at("om/actions/a.ts"),
  exportName: name,
  mcp: { mode: "settling" },
  ...over,
});

describe("buildSkillModel", () => {
  it("keeps only entries the author exposed with .mcp()", () => {
    const m = buildSkillModel(
      set({
        oms: [om("shown"), om("hidden", { mcp: undefined })],
        actions: [action("visible"), action("private", { mcp: undefined })],
      }),
      reg(),
      ROOT
    );
    expect(m.oms.map((o) => o.name)).toEqual(["shown"]);
    expect(m.actions.map((a) => a.name)).toEqual(["visible"]);
  });

  it("emits project-relative posix paths", () => {
    const m = buildSkillModel(set({ oms: [om("b")] }), reg(), ROOT);
    expect(m.oms[0]!.file).toBe("om/build.ts");
  });

  it("keeps an absolute path when the file lies outside the project root", () => {
    const outside = path.resolve("/elsewhere/x.ts");
    const m = buildSkillModel(set({ oms: [om("b", { file: outside })] }), reg(), ROOT);
    expect(m.oms[0]!.file).not.toMatch(/\.\./);
    expect(m.oms[0]!.file.endsWith("elsewhere/x.ts")).toBe(true);
  });

  it("sketches args, and falls back to the raw schema when it cannot", () => {
    const sketchable: JsonSchema = {
      type: "object",
      properties: { v: { type: "boolean" } },
      required: [],
    };
    const opaque: JsonSchema = {
      type: "object",
      properties: { v: { anyOf: [{ type: "string" }, { type: "number" }] } },
    };
    const m = buildSkillModel(
      set({ oms: [om("a", { inputSchema: sketchable }), om("z", { inputSchema: opaque })] }),
      reg(),
      ROOT
    );
    expect(m.oms[0]!.argHint).toBe("{ v?: boolean }");
    expect(m.oms[0]!.argSchema).toBeUndefined();
    expect(m.oms[1]!.argHint).toBeUndefined();
    expect(m.oms[1]!.argSchema).toEqual(opaque);
  });

  it("omits both arg fields when no args were declared", () => {
    const m = buildSkillModel(set({ oms: [om("b")] }), reg(), ROOT);
    expect(m.oms[0]!.argHint).toBeUndefined();
    expect(m.oms[0]!.argSchema).toBeUndefined();
  });

  it("attaches the outline from the AST scan, matched on name and file", () => {
    const m = buildSkillModel(
      set({ oms: [om("b")] }),
      reg({
        oms: [
          { name: "b", file: at(BUILD), line: 1, calls: [{ name: "command", tag: "t" }] },
          { name: "b", file: at("om/other.ts"), line: 1, calls: [{ name: "wrong" }] },
        ],
      }),
      ROOT
    );
    expect(m.oms[0]!.calls).toEqual([{ name: "command", tag: "t" }]);
  });

  it("carries an action's capability flag and export name", () => {
    const m = buildSkillModel(
      set({ actions: [action("inspectPage", { exportName: "inspectPage" })] }),
      reg({
        actions: [
          {
            name: "inspectPage",
            file: at("om/actions/a.ts"),
            exportName: "inspectPage",
            publishesCapability: true,
            events: false,
          },
        ],
      }),
      ROOT
    );
    expect(m.actions[0]!.exportName).toBe("inspectPage");
    expect(m.actions[0]!.publishesCapability).toBe(true);
  });

  it("sorts alphabetically regardless of discovery order, and hashes identically", () => {
    const a = buildSkillModel(set({ oms: [om("z"), om("a")] }), reg(), ROOT);
    const b = buildSkillModel(set({ oms: [om("a"), om("z")] }), reg(), ROOT);
    expect(a.oms.map((o) => o.name)).toEqual(["a", "z"]);
    expect(a.hash).toBe(b.hash);
  });

  it("hashes as 8 hex characters", () => {
    expect(buildSkillModel(set({ oms: [om("b")] }), reg(), ROOT).hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it("moves the hash when a summary, a mode, a schema, or the outline changes", () => {
    const base = buildSkillModel(set({ oms: [om("b")] }), reg(), ROOT).hash;
    const summary = buildSkillModel(
      set({ oms: [om("b", { summary: "does a thing" })] }),
      reg(),
      ROOT
    ).hash;
    const mode = buildSkillModel(
      set({ oms: [om("b", { mcp: { mode: "long-lived" } })] }),
      reg(),
      ROOT
    ).hash;
    const schema = buildSkillModel(
      set({
        oms: [om("b", { inputSchema: { type: "object", properties: { v: { type: "boolean" } } } })],
      }),
      reg(),
      ROOT
    ).hash;
    const outline = buildSkillModel(
      set({ oms: [om("b")] }),
      reg({ oms: [{ name: "b", file: at(BUILD), line: 1, calls: [{ name: "command" }] }] }),
      ROOT
    ).hash;
    expect(new Set([base, summary, mode, schema, outline]).size).toBe(5);
  });

  it("is insensitive to property order inside a schema", () => {
    const one = buildSkillModel(
      set({ oms: [om("b", { inputSchema: { type: "object", properties: {}, required: [] } })] }),
      reg(),
      ROOT
    ).hash;
    const two = buildSkillModel(
      set({ oms: [om("b", { inputSchema: { required: [], properties: {}, type: "object" } })] }),
      reg(),
      ROOT
    ).hash;
    expect(one).toBe(two);
  });
});
