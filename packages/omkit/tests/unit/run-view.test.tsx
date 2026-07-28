import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { RunView, PromptView } from "../../src/cli/ui/views/RunView.tsx";
import type { PromptRequest } from "../../src/client/types.ts";

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

  test("input: shows the default hint, and empty Enter answers the default", async () => {
    const req: PromptRequest = {
      id: "p3",
      spec: { kind: "input", message: "Name?", default: "anon" },
    };
    const onAnswer = vi.fn();
    const { lastFrame, stdin } = render(<PromptView request={req} onAnswer={onAnswer} />);
    expect(lastFrame()).toContain("default: anon");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r"); // no input → default
    await new Promise((r) => setTimeout(r, 20));
    expect(onAnswer).toHaveBeenCalledWith("anon");
  });

  test("choice: a long option list is searchable — typing filters, Enter picks the match", async () => {
    const choices = Array.from({ length: 20 }, (_, i) => ({
      label: `env-${i}`,
      value: `env-${i}`,
    }));
    const req: PromptRequest = {
      id: "p4",
      spec: { kind: "choice", message: "Target?", default: "env-0", choices },
    };
    const onAnswer = vi.fn();
    const { lastFrame, stdin } = render(<PromptView request={req} onAnswer={onAnswer} />);
    expect(lastFrame()).toContain("+"); // "+N more" footer while overflowing
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("env-13");
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(onAnswer).toHaveBeenCalledWith("env-13");
  });
});
