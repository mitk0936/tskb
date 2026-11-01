import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import {
  RunView,
  PromptView,
  MAX_TREE_ROWS,
  formatDuration,
  nodeLabel,
} from "../../src/cli/ui/views/RunView.tsx";
import type { PromptRequest } from "../../src/client/types.ts";
import type { RunNode } from "../../src/output/RunModel.ts";

describe("RunView", () => {
  const node = (path: string, extra: Partial<RunNode> = {}): RunNode => ({
    path,
    status: "running",
    tags: [],
    startedAt: Date.now(),
    ...extra,
  });

  test("shows the running nodes under the root, with their latest line and the tally", () => {
    const { lastFrame } = render(
      <RunView
        name="dev"
        phase="running"
        startedAt={Date.now()}
        nodes={[node("main"), node("main/vite", { tags: ["ready"], last: "listening on 5173" })]}
        summary={{ running: ["main/vite", "main"], ok: 2, failed: 1, cancelled: 0 }}
        onAnswer={() => {}}
      />
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("dev · running");
    expect(frame).toContain("● vite [ready]");
    expect(frame).toContain("└ listening on 5173");
    expect(frame).toContain("✓ 2 ok · ✗ 1 failed");
  });

  test("collapses the running nodes past the cap into +N more", () => {
    const paths = Array.from({ length: MAX_TREE_ROWS + 3 }, (_, i) => `main/n${i}`);
    const { lastFrame } = render(
      <RunView
        name="fan"
        phase="running"
        startedAt={Date.now()}
        nodes={paths.map((p) => node(p))}
        summary={{ running: paths, ok: 0, failed: 0, cancelled: 0 }}
        onAnswer={() => {}}
      />
    );
    expect(lastFrame()).toContain("+3 more running");
  });

  test("an up stack and a teardown each say so in the header", () => {
    const up = render(
      <RunView
        name="dev"
        phase="up"
        startedAt={0}
        upAt={Date.now()}
        nodes={[]}
        onAnswer={() => {}}
      />
    );
    expect(up.lastFrame()).toContain("● up");
    const stopping = render(
      <RunView
        name="dev"
        phase="stopping"
        startedAt={0}
        nodes={[node("main/vite")]}
        summary={{ running: ["main/vite"], ok: 0, failed: 0, cancelled: 0 }}
        onAnswer={() => {}}
      />
    );
    expect(stopping.lastFrame()).toContain("stopping…");
    expect(stopping.lastFrame()).toContain("◌ vite");
  });

  test("a node's label drops its id and keeps both ends of a long name", () => {
    expect(nodeLabel({ path: "main/tailLog_bbe803dc", tags: ["tail"] })).toBe("tailLog [tail]");
    expect(nodeLabel({ path: "main/dev/vite", tags: [] })).toBe("vite");
    const cmd = "C-nvm4w-nodejs-node.exe-D-tskb-om-scripts-held-log-writer.mjs-C_3d6d7001";
    const label = nodeLabel({ path: `main/${cmd}`, tags: ["writer"] });
    expect(label).toBe("C-nvm4w-nodejs-node…eld-log-writer.mjs-C [writer]");
  });

  test("durations read at a glance", () => {
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(8_300)).toBe("8.3s");
    expect(formatDuration(192_000)).toBe("3m12s");
    expect(formatDuration(3_840_000)).toBe("1h04m");
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
