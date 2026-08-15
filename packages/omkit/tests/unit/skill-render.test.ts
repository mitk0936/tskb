import { describe, it, expect } from "vitest";
import { renderSkill } from "../../src/skill/render.ts";
import type { SkillEntry, SkillModel } from "../../src/skill/model.ts";

const DESCRIPTION = "Runnable workflows in this repo.";

const model = (over: Partial<SkillModel> = {}): SkillModel => ({
  oms: [],
  actions: [],
  hash: "a1b2c3d4",
  ...over,
});

const om = (over: Partial<SkillEntry> = {}): SkillEntry => ({
  kind: "om",
  name: "tskb:build",
  file: "om/oms/tskb-build.ts",
  mode: "settling",
  ...over,
});

const render = (m: SkillModel): string => renderSkill(m, { description: DESCRIPTION });

describe("renderSkill", () => {
  it("writes frontmatter with the given description and the hash marker", () => {
    const out = render(model({ oms: [om()] }));
    expect(out.startsWith("---\nname: omkit-runs\n")).toBe(true);
    expect(out).toContain(`description: ${DESCRIPTION}`);
    expect(out).toContain("registry-hash: a1b2c3d4");
  });

  it("renders an om's summary, path, args, and outline", () => {
    const out = render(
      model({
        oms: [
          om({
            summary: "Rebuild the graph.",
            argHint: "{ verbose?: boolean }",
            calls: [{ name: "watchDir", tag: "watch:build:daemon" }, { name: "buildDocs" }],
          }),
        ],
      })
    );
    expect(out).toContain("### `tskb:build` — settling");
    expect(out).toContain("Rebuild the graph.");
    expect(out).toContain("- **Defined in:** `om/oms/tskb-build.ts`");
    expect(out).toContain("- **Args:** `{ verbose?: boolean }`");
    expect(out).toContain("- **Calls:** `watchDir` [watch:build:daemon] → `buildDocs`");
  });

  it("says a summary is missing rather than inventing prose", () => {
    const out = render(model({ oms: [om()] }));
    expect(out).toContain("_No summary. The author can add one with `.describe({ summary })`._");
  });

  it("marks a long-lived om as start_om only", () => {
    const out = render(model({ oms: [om({ name: "tskb:dev", mode: "long-lived" })] }));
    expect(out).toContain("### `tskb:dev` — long-lived · `start_om` only, it does not finish");
  });

  it("falls back to a fenced schema when there is no short form", () => {
    const schema = { type: "object", properties: { when: { type: "string" } } };
    const out = render(model({ oms: [om({ argSchema: schema })] }));
    expect(out).not.toContain("- **Args:** `");
    expect(out).toContain("```json");
    expect(out).toContain('"when"');
  });

  it("reports an entry that cannot be called", () => {
    const out = render(model({ oms: [om({ unavailable: "its schema would not convert" })] }));
    expect(out).toContain("- **Not callable:** its schema would not convert");
  });

  it("omits the Actions heading when none are exposed", () => {
    expect(render(model({ oms: [om()] }))).not.toContain("## Actions");
  });

  it("carries the host-om caveat and the capability warning for actions", () => {
    const out = render(
      model({
        actions: [
          {
            kind: "action",
            name: "inspectPage",
            file: "om/actions/inspect-page.ts",
            mode: "settling",
            exportName: "inspectPage",
            publishesCapability: true,
          },
        ],
      })
    );
    expect(out).toContain("## Actions");
    expect(out).toContain("It cannot execute on its own");
    expect(out).toContain("- **Exported as:** `inspectPage`");
    expect(out).toContain("- **Publishes a capability.**");
  });

  it("documents both the shell and the MCP path", () => {
    const out = render(model({ oms: [om()] }));
    expect(out).toContain("npx omkit run tskb:build");
    expect(out).toContain("OMKIT_ARGS=");
    expect(out).toContain("claude mcp add omkit -- npx omkit mcp");
    expect(out).toContain("`list_oms` is authoritative");
  });

  it("builds the OMKIT_ARGS example from a real declared field", () => {
    const out = render(model({ oms: [om({ argHint: "{ verbose?: boolean, name?: string }" })] }));
    expect(out).toContain(`OMKIT_ARGS='{"verbose":false}'`);
  });

  it("labels the outline as an approximation", () => {
    const out = render(model({ oms: [om({ calls: [{ name: "command" }] })] }));
    expect(out).toContain("static reading of the body, not a trace");
    expect(out).toContain("A conditional call is listed");
  });

  it("states the run folder layout and nothing else", () => {
    expect(render(model({ oms: [om()] }))).toContain("`logs/<name>-<hash8>/<date>/<time>/`");
  });

  it("says so plainly when nothing is exposed", () => {
    const out = render(model());
    expect(out).toContain("_None exposed. Mark an om with `.mcp()` to list it here._");
  });

  it("is byte-identical across repeated renders", () => {
    const m = model({
      oms: [om({ summary: "s", argHint: "{ v?: boolean }", calls: [{ name: "c", tag: "t" }] })],
      actions: [
        {
          kind: "action",
          name: "a",
          file: "x.ts",
          mode: "settling",
          exportName: "a",
        },
      ],
    });
    expect(render(m)).toBe(render(m));
  });

  it("ends with exactly one trailing newline", () => {
    const out = render(model({ oms: [om()] }));
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });
});
