import { describe, expect, test, vi } from "vitest";
import path from "node:path";
import { render } from "ink-testing-library";
import { OmList, labelOf } from "../../src/cli/ui/views/OmList.tsx";
import type { DiscoveredOm } from "../../src/client/registry.ts";

const oms: DiscoveredOm[] = [
  { name: "dev", file: "/p/oms/dev.ts", line: 1 },
  { name: "deploy", file: "/p/oms/deploy.ts", line: 1 },
  {
    name: "build",
    file: "/p/oms/build.ts",
    line: 7,
    summary: "Compile the docs graph",
    calls: [{ name: "watchDir", tag: "watch" }, { name: "buildDocs" }],
  },
];

const tick = () => new Promise((r) => setTimeout(r, 20));

/** The om names on the list's rows, top to bottom — rows are the lines that open with the marker column. */
const rowNames = (frame: string): string[] =>
  frame
    .split("\n")
    .map((l) => /^(?:❯ | {2})(\S+)/.exec(l)?.[1])
    .filter((n): n is string => !!n);

describe("OmList", () => {
  test("renders all om names, and a path for a row without a summary", () => {
    const { lastFrame } = render(<OmList oms={oms} onSelect={() => {}} />);
    expect(rowNames(lastFrame()!)).toEqual(["build", "deploy", "dev"]);
    expect(lastFrame()).toContain("dev.ts");
  });

  test("a row shows its summary, and the highlighted om is shown in full below the list", () => {
    const { lastFrame } = render(<OmList oms={oms} onSelect={() => {}} />);
    const frame = lastFrame()!;
    expect(frame).toContain("Compile the docs graph");
    // "build" is highlighted first: its file:line and numbered steps are in the detail pane
    expect(frame).toContain("build.ts:7");
    expect(frame).toMatch(/1  watchDir   watch/);
    expect(frame).toMatch(/2  buildDocs/);
  });

  test("typing filters by name", async () => {
    const { lastFrame, stdin } = render(<OmList oms={oms} onSelect={() => {}} />);
    await tick();
    stdin.write("de");
    await tick();
    expect(rowNames(lastFrame()!)).toEqual(["deploy", "dev"]);
  });

  test("the search matches summaries too", async () => {
    const { lastFrame, stdin } = render(<OmList oms={oms} onSelect={() => {}} />);
    await tick();
    stdin.write("docs graph");
    await tick();
    expect(rowNames(lastFrame()!)).toEqual(["build"]);
  });

  test("Esc clears the search", async () => {
    const { lastFrame, stdin } = render(<OmList oms={oms} onSelect={() => {}} />);
    await tick();
    stdin.write("deploy");
    await tick();
    expect(rowNames(lastFrame()!)).toEqual(["deploy"]);
    stdin.write("\u001b");
    await tick();
    expect(rowNames(lastFrame()!)).toHaveLength(3);
  });

  test("Enter selects the highlighted om", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<OmList oms={oms} onSelect={onSelect} />);
    await tick();
    stdin.write("\r"); // Enter on the first (highlighted) row — "build", first by name
    await tick();
    expect(onSelect).toHaveBeenCalledWith(oms.find((o) => o.name === "build"));
  });

  test("lists oms nearest the working directory first, then by name", () => {
    const here = (rel: string): string => path.join(process.cwd(), rel);
    const nested: DiscoveredOm[] = [
      { name: "a-nightly", file: here("om/ci/nightly/a.ts"), line: 1 },
      { name: "z-top", file: here("z.ts"), line: 1 },
      { name: "b-build", file: here("om/build.ts"), line: 1 },
      { name: "a-build", file: here("om/a.ts"), line: 1 },
    ];
    const { lastFrame } = render(<OmList oms={nested} onSelect={() => {}} />);
    expect(rowNames(lastFrame()!)).toEqual(["z-top", "a-build", "b-build", "a-nightly"]);
  });
});

const lines = (frame: string | undefined): string[] => (frame ?? "").split("\n");

describe("OmList detail box", () => {
  test("lays the om out as fields — summary, every further describe prop, where it is defined", () => {
    const om: DiscoveredOm = {
      name: "dev",
      file: `${process.cwd()}/oms/dev.ts`,
      line: 12,
      summary: "Bring up the dev stack",
      details: [
        { key: "owner", value: "platform" },
        { key: "docsUrl", value: "https://x.dev" },
      ],
    };
    const frame = render(<OmList oms={[om]} onSelect={() => {}} />).lastFrame();
    const row = (label: string) => lines(frame).find((l) => l.includes(label)) ?? "";
    expect(row("Summary")).toMatch(/Summary\s+Bring up the dev stack/);
    expect(row("Owner")).toMatch(/Owner\s+platform/);
    expect(row("Docs url")).toMatch(/Docs url\s+https:\/\/x\.dev/);
    expect(row("Defined")).toMatch(/Defined\s+.*dev\.ts:12/);
    // the values line up in one column
    const col = (label: string) => row(label).indexOf(label === "Owner" ? "platform" : "Bring");
    expect(col("Owner")).toBe(col("Summary"));
  });

  test("numbers the steps, tags beside them, and collapses a long outline", () => {
    const calls = Array.from({ length: 13 }, (_, i) =>
      i === 0 ? { name: "watchDir", tag: "watch:build" } : { name: `step${i}` }
    );
    const om: DiscoveredOm = { name: "big", file: "/p/big.ts", line: 1, calls };
    const frame = render(<OmList oms={[om]} onSelect={() => {}} />).lastFrame() ?? "";
    expect(frame).toContain("Steps");
    expect(frame).toContain("approximate");
    expect(frame).toMatch(/ 1 {2}watchDir {2}watch:build/);
    expect(frame).toMatch(/10 {2}step9/);
    expect(frame).not.toContain("step10");
    expect(frame).toContain("+3 more");
  });

  test("says how to add a summary when there is none", () => {
    const om: DiscoveredOm = { name: "bare", file: "/p/bare.ts", line: 1 };
    const frame = render(<OmList oms={[om]} onSelect={() => {}} />).lastFrame() ?? "";
    expect(frame).toContain("add .describe({ summary }) to the om");
  });

  test("labels read as words whatever the key's casing", () => {
    expect(labelOf("owner")).toBe("Owner");
    expect(labelOf("docsUrl")).toBe("Docs url");
    expect(labelOf("needs-auth")).toBe("Needs auth");
    expect(labelOf("max_retries")).toBe("Max retries");
  });
});
