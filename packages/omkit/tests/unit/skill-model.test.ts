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
      { root: ROOT }
    );
    expect(m.oms.map((o) => o.name)).toEqual(["shown"]);
    expect(m.actions.map((a) => a.name)).toEqual(["visible"]);
  });

  it("emits project-relative posix paths", () => {
    const m = buildSkillModel(set({ oms: [om("b")] }), reg(), { root: ROOT });
    expect(m.oms[0]!.file).toBe("om/build.ts");
  });

  it("keeps an absolute path when the file lies outside the project root", () => {
    const outside = path.resolve("/elsewhere/x.ts");
    const m = buildSkillModel(set({ oms: [om("b", { file: outside })] }), reg(), { root: ROOT });
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
      { root: ROOT }
    );
    expect(m.oms[0]!.argHint).toBe("{ v?: boolean }");
    expect(m.oms[0]!.argSchema).toBeUndefined();
    expect(m.oms[1]!.argHint).toBeUndefined();
    expect(m.oms[1]!.argSchema).toEqual(opaque);
  });

  it("omits both arg fields when no args were declared", () => {
    const m = buildSkillModel(set({ oms: [om("b")] }), reg(), { root: ROOT });
    expect(m.oms[0]!.argHint).toBeUndefined();
    expect(m.oms[0]!.argSchema).toBeUndefined();
    expect(m.oms[0]!.argExample).toBeUndefined();
  });

  describe("the OMKIT_ARGS example", () => {
    const exampleOf = (inputSchema: JsonSchema): Record<string, unknown> | undefined =>
      buildSkillModel(set({ oms: [om("a", { inputSchema })] }), reg(), { root: ROOT }).oms[0]!
        .argExample;

    it("carries every required field, since a run cannot start without them", () => {
      expect(
        exampleOf({
          type: "object",
          properties: { target: { type: "string" }, replicas: { type: "integer" } },
          required: ["target"],
        })
      ).toEqual({ target: "…" });
    });

    it("takes an enum's first member — the case a hint-regex could not read", () => {
      expect(
        exampleOf({
          type: "object",
          properties: { suite: { enum: ["Full_Layouts", "Full_Platform"] } },
        })
      ).toEqual({ suite: "Full_Layouts" });
    });

    it("prefers a declared default over an invented value", () => {
      expect(
        exampleOf({ type: "object", properties: { port: { type: "integer", default: 9876 } } })
      ).toEqual({ port: 9876 });
    });

    it("shows one optional field when nothing is required", () => {
      expect(
        exampleOf({
          type: "object",
          properties: { verbose: { type: "boolean" }, name: { type: "string" } },
          required: [],
        })
      ).toEqual({ verbose: false });
    });

    it("gives up rather than emit an example that would still prompt", () => {
      expect(
        exampleOf({
          type: "object",
          properties: { config: { type: "object" }, name: { type: "string" } },
          required: ["config"],
        })
      ).toBeUndefined();
    });

    it("gives up when no field can be sampled at all", () => {
      expect(
        exampleOf({ type: "object", properties: { tags: { type: "array" } } })
      ).toBeUndefined();
    });
  });

  describe("the invocation", () => {
    it("records a config the reader has to name, relative to the root", () => {
      const m = buildSkillModel(set({ oms: [om("b")] }), reg(), {
        root: ROOT,
        tsconfig: at("om/tsconfig.omkit.json"),
      });
      expect(m.tsconfig).toBe("om/tsconfig.omkit.json");
    });

    it("stays silent when omkit's own default already finds it", () => {
      const m = buildSkillModel(set({ oms: [om("b")] }), reg(), {
        root: ROOT,
        tsconfig: at("tsconfig.omkit.json"),
      });
      expect(m.tsconfig).toBeUndefined();
    });

    it("moves the hash, since every command in the file depends on it", () => {
      const base = buildSkillModel(set({ oms: [om("b")] }), reg(), { root: ROOT }).hash;
      const moved = buildSkillModel(set({ oms: [om("b")] }), reg(), {
        root: ROOT,
        tsconfig: at("om/tsconfig.omkit.json"),
      }).hash;
      expect(moved).not.toBe(base);
    });
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
      { root: ROOT }
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
      { root: ROOT }
    );
    expect(m.actions[0]!.exportName).toBe("inspectPage");
    expect(m.actions[0]!.publishesCapability).toBe(true);
  });

  it("sorts alphabetically regardless of discovery order, and hashes identically", () => {
    const a = buildSkillModel(set({ oms: [om("z"), om("a")] }), reg(), { root: ROOT });
    const b = buildSkillModel(set({ oms: [om("a"), om("z")] }), reg(), { root: ROOT });
    expect(a.oms.map((o) => o.name)).toEqual(["a", "z"]);
    expect(a.hash).toBe(b.hash);
  });

  it("hashes as 8 hex characters", () => {
    expect(buildSkillModel(set({ oms: [om("b")] }), reg(), { root: ROOT }).hash).toMatch(
      /^[0-9a-f]{8}$/
    );
  });

  it("moves the hash when a summary, a mode, a schema, or the outline changes", () => {
    const base = buildSkillModel(set({ oms: [om("b")] }), reg(), { root: ROOT }).hash;
    const summary = buildSkillModel(set({ oms: [om("b", { summary: "does a thing" })] }), reg(), {
      root: ROOT,
    }).hash;
    const mode = buildSkillModel(set({ oms: [om("b", { mcp: { mode: "long-lived" } })] }), reg(), {
      root: ROOT,
    }).hash;
    const schema = buildSkillModel(
      set({
        oms: [om("b", { inputSchema: { type: "object", properties: { v: { type: "boolean" } } } })],
      }),
      reg(),
      { root: ROOT }
    ).hash;
    const outline = buildSkillModel(
      set({ oms: [om("b")] }),
      reg({ oms: [{ name: "b", file: at(BUILD), line: 1, calls: [{ name: "command" }] }] }),
      { root: ROOT }
    ).hash;
    expect(new Set([base, summary, mode, schema, outline]).size).toBe(5);
  });

  it("is insensitive to property order inside a schema", () => {
    const one = buildSkillModel(
      set({ oms: [om("b", { inputSchema: { type: "object", properties: {}, required: [] } })] }),
      reg(),
      { root: ROOT }
    ).hash;
    const two = buildSkillModel(
      set({ oms: [om("b", { inputSchema: { required: [], properties: {}, type: "object" } })] }),
      reg(),
      { root: ROOT }
    ).hash;
    expect(one).toBe(two);
  });
});
