import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, test } from "vitest";
import { om } from "../../src/index.ts";
import { prompt, readUntil } from "../../src/actions/prompt.ts";
import { ExecutionTree } from "../../src/core/ExecutionTree.ts";
import {
  createSupervisor,
  installSupervisor,
  type ChildMessage,
  type SupervisorMessage,
} from "../../src/core/interaction.ts";

/** Feed a fixed script of lines, one per call, then EOF (undefined). */
const scripted = (lines: string[]) => {
  let i = 0;
  return async (): Promise<string | undefined> => lines[i++];
};

describe("readUntil", () => {
  test("'json' stops as soon as the accumulated text parses", async () => {
    const read = scripted(["{", '  "host": "db.local",', '  "port": 5432', "}", "never"]);
    expect(await readUntil(read, "json")).toBe('{\n  "host": "db.local",\n  "port": 5432\n}');
  });

  test("a sentinel string stops on that line and excludes it", async () => {
    const read = scripted(["first", "second", ".", "after"]);
    expect(await readUntil(read, ".")).toBe("first\nsecond");
  });

  test("a predicate stops when it returns true", async () => {
    const read = scripted(["a", "ab", "abc"]);
    expect(await readUntil(read, (text) => text.length >= 4)).toBe("a\nab");
  });

  test("EOF ends input and returns what was collected", async () => {
    const read = scripted(["only line"]);
    expect(await readUntil(read, ".")).toBe("only line");
  });

  test("'json' returns the text unparsed if EOF arrives first", async () => {
    const read = scripted(["{ broken"]);
    expect(await readUntil(read, "json")).toBe("{ broken");
  });
});

afterEach(() => {
  installSupervisor(null);
  ExecutionTree.reset();
  process.exitCode = 0;
});

/**
 * Run `body` with stdin/stdout swapped for in-memory streams, so the bare-terminal path can be
 * driven with nobody typing and without the prompt text reaching the reporter. Resolves with
 * everything that was written to the fake stdout.
 */
async function withFakeStdio(body: () => Promise<void>): Promise<string> {
  const stdin = new PassThrough(); // never emits a line — nobody is at the keyboard
  let written = "";
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  const realStdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
  const realStdout = Object.getOwnPropertyDescriptor(process, "stdout")!;
  Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
  Object.defineProperty(process, "stdout", { value: stdout, configurable: true });
  try {
    await body();
  } finally {
    Object.defineProperty(process, "stdin", realStdin);
    Object.defineProperty(process, "stdout", realStdout);
  }
  return written;
}

describe("a multiline prompt at the bare terminal", () => {
  test("a timeout uses the default and reports via:timeout, like the other kinds", async () => {
    // Nobody types, so the read is still pending when the 20ms timeout aborts it. The abort must
    // not masquerade as end-of-input: it has to reach the action's outer catch, or the answer
    // would be mislabelled `default` (or, mid-paste, a partial blob labelled `input`).
    let answer: { value: string; via: string } | undefined;
    let got: string | undefined;

    const written = await withFakeStdio(async () => {
      await om("multiline-timeout", async () => {
        const asked = prompt({
          kind: "multiline",
          message: "Paste config",
          hint: "{ host: string }",
          default: "fallback",
          timeoutMs: 20,
        });
        asked.on("answer", (a) => void (answer = a));
        got = await asked.result.catch(() => "ERR");
      });
    });

    expect(got).toBe("fallback");
    expect(answer).toEqual({ value: "fallback", via: "timeout" });
    // The message and hint really did reach the terminal before the wait began.
    expect(written).toContain("Paste config");
    expect(written).toContain("{ host: string }");
  });
});

describe("a multiline prompt under a supervisor", () => {
  test("forwards the kind and hint on the spec, and takes the answer verbatim", async () => {
    // Supervised, the whole block comes back as one answer — `readUntil` is the bare-terminal
    // path only — so what matters here is that the frontend is told it is a multiline prompt.
    const sent: ChildMessage[] = [];
    let deliver: ((m: SupervisorMessage) => void) | undefined;
    const sup = createSupervisor(
      (m) => {
        sent.push(m);
        if (m.kind === "prompt")
          deliver?.({ kind: "answer", id: m.id, value: "{\n  a: 1\n}", via: "input" });
      },
      (cb) => void (deliver = cb)
    );
    installSupervisor(sup);

    let got: string | undefined;
    await om("ask-multiline", async () => {
      got = await prompt({
        kind: "multiline",
        message: "Paste config",
        hint: "{ host: string }",
      }).result.catch(() => "ERR");
    });

    expect(got).toBe("{\n  a: 1\n}");
    const req = sent.find((m) => m.kind === "prompt");
    expect(req).toBeDefined();
    if (req?.kind === "prompt") {
      expect(req.spec.kind).toBe("multiline");
      expect(req.spec.message).toBe("Paste config");
      expect(req.spec.hint).toBe("{ host: string }");
    }
  });
});
