import { describe, expect, test, vi } from "vitest";
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
    stdin.write("\r"); // Enter on the first (highlighted) row
    await new Promise((r) => setTimeout(r, 20));
    expect(onSelect).toHaveBeenCalledWith(oms[0]);
  });
});
