import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { RunView, PromptView } from "../../src/cli/ui/views/RunView.tsx";
import type { PromptRequest } from "../../src/cli/client/types.ts";

describe("RunView", () => {
  test("renders milestone lines and the verdict", () => {
    const { lastFrame } = render(
      <RunView
        lines={["▶ main/probe", "✓ main · ok"]}
        verdict={{ ok: true, folder: "/r", summary: [] }}
        onAnswer={() => {}}
      />
    );
    expect(lastFrame()).toContain("▶ main/probe");
    expect(lastFrame()).toContain("✓ main · ok");
    expect(lastFrame()?.toLowerCase()).toContain("ok");
  });
});

describe("PromptView", () => {
  test("choice: highlighted default, Enter answers its value", async () => {
    const req: PromptRequest = {
      id: "p1",
      spec: {
        kind: "choice",
        message: "Deploy?",
        default: "no",
        choices: [
          { label: "no", value: "no" },
          { label: "yes", value: "yes" },
        ],
      },
    };
    const onAnswer = vi.fn();
    const { lastFrame, stdin } = render(<PromptView request={req} onAnswer={onAnswer} />);
    expect(lastFrame()).toContain("Deploy?");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(onAnswer).toHaveBeenCalledWith("no");
  });

  test("input: typing then Enter answers the typed text", async () => {
    const req: PromptRequest = {
      id: "p2",
      spec: { kind: "input", message: "Name?", default: "anon" },
    };
    const onAnswer = vi.fn();
    const { stdin } = render(<PromptView request={req} onAnswer={onAnswer} />);
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("Ada");
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(onAnswer).toHaveBeenCalledWith("Ada");
  });
});
