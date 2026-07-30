import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { prompt } from "../../src/actions/prompt.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import {
  createSupervisor,
  installSupervisor,
  type ChildMessage,
  type SupervisorMessage,
} from "../../src/core/interaction.ts";

/** A supervisor that auto-answers the first prompt it receives with `answer`. */
function autoAnswering(answer: { value: string; via: string }) {
  const sent: ChildMessage[] = [];
  let deliver: ((m: SupervisorMessage) => void) | undefined;
  const sup = createSupervisor(
    (m) => {
      sent.push(m);
      if (m.kind === "prompt") deliver?.({ kind: "answer", id: m.id, ...answer });
    },
    (cb) => void (deliver = cb)
  );
  return { sup, sent };
}

afterEach(() => {
  installSupervisor(null);
  ExecutionTree.reset();
  process.exitCode = 0;
});

describe("prompt under a supervisor", () => {
  test("routes the request over the channel and resolves from the answer", async () => {
    const { sup, sent } = autoAnswering({ value: "yes", via: "input" });
    installSupervisor(sup);

    let picked: string | undefined;
    await om("ask").run(async () => {
      picked = await prompt({
        kind: "choice",
        message: "Deploy?",
        choices: ["no", "yes"],
        default: "no",
      }).result.catch(() => "ERR");
    });

    expect(picked).toBe("yes");
    const req = sent.find((m) => m.kind === "prompt");
    expect(req).toBeDefined();
    if (req?.kind === "prompt") {
      expect(req.spec.kind).toBe("choice");
      expect(req.spec.message).toBe("Deploy?");
      expect(req.spec.default).toBe("no");
      expect(req.spec.choices).toEqual([
        { label: "no", value: "no" },
        { label: "yes", value: "yes" },
      ]);
    }
  });

  test("falls back to the default on timeout when the supervisor never answers", async () => {
    // A supervisor that receives prompts but never answers them.
    const sent: ChildMessage[] = [];
    const sup = createSupervisor(
      (m) => void sent.push(m),
      () => {}
    );
    installSupervisor(sup);

    let picked: string | undefined;
    await om("ask-timeout").run(async () => {
      picked = await prompt({ message: "Name?", default: "anon", timeoutMs: 20 }).result.catch(
        () => "ERR"
      );
    });

    expect(picked).toBe("anon");
    expect(sent.some((m) => m.kind === "prompt")).toBe(true);
  });
});
