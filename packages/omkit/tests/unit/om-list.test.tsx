import { describe, expect, test, vi } from "vitest";
import path from "node:path";
import { render } from "ink-testing-library";
import { OmList } from "../../src/cli/ui/views/OmList.tsx";
import type { DiscoveredOm } from "../../src/client/registry.ts";

const oms: DiscoveredOm[] = [
  { name: "dev", file: "/p/oms/dev.ts", line: 1 },
  { name: "deploy", file: "/p/oms/deploy.ts", line: 1 },
  { name: "build", file: "/p/oms/build.ts", line: 1 },
];

describe("OmList", () => {
  test("renders all om names and their paths initially", () => {
    const { lastFrame } = render(<OmList oms={oms} onSelect={() => {}} />);
    expect(lastFrame()).toContain("dev");
    expect(lastFrame()).toContain("deploy");
    expect(lastFrame()).toContain("build");
    expect(lastFrame()).toContain("dev.ts"); // path column is shown
  });

  test("typing filters by name", async () => {
    const { lastFrame, stdin } = render(<OmList oms={oms} onSelect={() => {}} />);
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("de");
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain("dev");
    expect(lastFrame()).toContain("deploy");
    expect(lastFrame()).not.toContain("build");
  });

  test("Enter selects the highlighted om", async () => {
    const onSelect = vi.fn();
    const { stdin } = render(<OmList oms={oms} onSelect={onSelect} />);
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r"); // Enter on the first (highlighted) row — "build", first by name
    await new Promise((r) => setTimeout(r, 20));
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
    // Each row is "<marker> <name> <path>"; the name is the first token after the marker column.
    const names = lastFrame()!
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.replace(/^[❯\s]+/, "").split(/\s+/)[0]);
    expect(names).toEqual(["z-top", "a-build", "b-build", "a-nightly"]);
  });
});
