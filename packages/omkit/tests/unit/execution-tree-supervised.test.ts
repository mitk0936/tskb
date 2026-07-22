import { afterEach, describe, expect, test, vi } from "vitest";
import { om, action } from "../../src/index.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import {
  createSupervisor,
  installSupervisor,
  type ChildMessage,
  type SupervisorMessage,
} from "../../src/core/interaction.ts";

function recordingSupervisor() {
  const sent: ChildMessage[] = [];
  let deliver: ((m: SupervisorMessage) => void) | undefined;
  const sup = createSupervisor(
    (m) => void sent.push(m),
    (cb) => void (deliver = cb)
  );
  return { sup, sent, push: (m: SupervisorMessage) => deliver?.(m) };
}

afterEach(() => {
  installSupervisor(null);
  ExecutionTree.reset();
  process.exitCode = 0;
  vi.restoreAllMocks();
});

describe("ExecutionTree under a supervisor", () => {
  test("forwards log entries and emits a single settled verdict", async () => {
    const { sup, sent } = recordingSupervisor();
    installSupervisor(sup);

    await om("run-ok", async ({ snapshot }) => {
      await snapshot("state", { a: 1 });
    });

    const logs = sent.filter((m) => m.kind === "log");
    expect(logs.length).toBeGreaterThan(0);

    const settled = sent.filter((m) => m.kind === "settled");
    expect(settled).toHaveLength(1);
    if (settled[0].kind === "settled") {
      expect(settled[0].ok).toBe(true);
      expect(settled[0].folder).toBe(ExecutionTree.last!.folder.path());
    }
  });

  test("a failed run reports ok:false in the verdict", async () => {
    const { sup, sent } = recordingSupervisor();
    installSupervisor(sup);

    await om("run-fail", async () => {
      // Unobserved failure tears the run down and records a fault.
      action("boom").run(() => {
        throw new Error("nope");
      })();
    });

    const settled = sent.find((m) => m.kind === "settled");
    expect(settled?.kind === "settled" && settled.ok).toBe(false);
  });

  test("a cancel message tears the run down", async () => {
    const { sup, sent, push } = recordingSupervisor();
    installSupervisor(sup);

    await om("run-cancel", async ({ signal }) => {
      // Ask the supervisor to cancel, then wait — teardown must abort this signal.
      push({ kind: "cancel" });
      await new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        signal.addEventListener("abort", () => resolve(), { once: true });
      });
    });

    const settled = sent.find((m) => m.kind === "settled");
    expect(settled).toBeDefined();
  });

  test("writes no curated milestones or summary to stdout under supervision", async () => {
    const { sup } = recordingSupervisor();
    installSupervisor(sup);
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    await om("quiet", async ({ snapshot }) => {
      await snapshot("s", { ok: true });
    });

    const written = write.mock.calls.map((c) => String(c[0])).join("");
    expect(written).not.toContain("run started");
    expect(written).not.toContain("main log  →");
  });
});
