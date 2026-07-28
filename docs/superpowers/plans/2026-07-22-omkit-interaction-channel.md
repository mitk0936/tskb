# omkit Interaction Channel (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach omkit's runtime to run an om under an out-of-process supervisor — routing prompts, live log entries, the final verdict, and cancellation over a message channel — while leaving bare (unsupervised) runs behaving exactly as today.

**Architecture:** A tiny, dependency-free child-side module (`core/interaction.ts`) detects whether the process was forked with an IPC channel and marked supervised. When supervised, the `prompt` action routes its request/answer over that channel instead of `readline`, and `ExecutionTree` forwards curated log entries + a `settled` verdict to the supervisor, listens for `cancel`, and suppresses its own terminal rendering (the supervisor owns the terminal). When not supervised, every path falls back to today's behavior. This is the child half of the protocol the CLI/Ink app (Plan B/C) and a future MCP server (later) will drive.

**Tech Stack:** TypeScript (NodeNext ESM, `.ts` extension imports), Node built-ins only (`node:process` IPC), Vitest.

## Global Constraints

- **Node ≥ 20.11**, **ESM only**. (from `packages/omkit/package.json` `engines`)
- **No new dependencies.** Plan A uses only Node built-ins.
- **Import paths carry the explicit `.ts` extension** (NodeNext), matching existing `omkit` source.
- **Tests are Vitest, colocated** under `packages/omkit/tests/unit/`, importing from `../../src/...`, and call `ExecutionTree.reset()` in `afterEach` (see existing tests).
- **Bare-run behavior is unchanged.** Any supervised branch is additive and gated; the unsupervised path must remain byte-for-byte equivalent in behavior.
- **Run identity is untouched** — no changes to `RunFolder`/`omHash`/callsite.

---

### Task 1: Supervisor protocol + child-side client (`core/interaction.ts`)

**Files:**

- Create: `packages/omkit/src/core/interaction.ts`
- Test: `packages/omkit/tests/unit/interaction.test.ts`

**Interfaces:**

- Consumes: `LogEntry` from `../foundation/LogEntry.ts` (already exists: `{ sequence, ts, nodeId, path, level, source, message }`).
- Produces (relied on by Tasks 2 & 3 and by Plan B's SDK):
  - Message types `ChildMessage`, `SupervisorMessage`, `AnswerMessage`, `PromptSpec`.
  - `class Supervisor` with:
    - `request(spec: PromptSpec, signal: AbortSignal): Promise<AnswerMessage>` — sends a `prompt`, resolves on the matching `answer`; rejects (and forgets the pending id) when `signal` aborts.
    - `log(entry: LogEntry): void`
    - `settled(ok: boolean, folder: string): void`
    - `onCancel(handler: () => void): void`
  - `createSupervisor(send, onMessage): Supervisor` — factory for tests/production.
  - `activeSupervisor(): Supervisor | null` — the detected singleton (or null when unsupervised).
  - `installSupervisor(s: Supervisor | null): void` — test seam to override the active supervisor.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/interaction.test.ts
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createSupervisor,
  installSupervisor,
  activeSupervisor,
  type ChildMessage,
  type SupervisorMessage,
} from "../../src/core/interaction.ts";

/** A two-way in-memory channel standing in for Node's fork IPC. */
function fakeChannel() {
  const sent: ChildMessage[] = [];
  let deliver: ((m: SupervisorMessage) => void) | undefined;
  return {
    sent,
    send: (m: ChildMessage) => void sent.push(m),
    onMessage: (cb: (m: SupervisorMessage) => void) => void (deliver = cb),
    // Simulate the supervisor sending a message down to the child.
    push: (m: SupervisorMessage) => deliver?.(m),
  };
}

afterEach(() => installSupervisor(null));

describe("interaction channel — child side", () => {
  test("request sends a prompt and resolves on the matching answer", async () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const ac = new AbortController();

    const pending = sup.request({ kind: "input", message: "Name?", default: "" }, ac.signal);

    expect(ch.sent).toHaveLength(1);
    const req = ch.sent[0];
    expect(req.kind).toBe("prompt");
    const id = req.kind === "prompt" ? req.id : "";
    expect(id).not.toBe("");

    ch.push({ kind: "answer", id, value: "Ada", via: "input" });
    await expect(pending).resolves.toEqual({ kind: "answer", id, value: "Ada", via: "input" });
  });

  test("an answer for an unknown id is ignored", async () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const ac = new AbortController();
    const pending = sup.request({ kind: "input", message: "?", default: "d" }, ac.signal);
    ch.push({ kind: "answer", id: "does-not-exist", value: "x", via: "input" });
    // Still pending: resolve the real one.
    const id = ch.sent[0].kind === "prompt" ? ch.sent[0].id : "";
    ch.push({ kind: "answer", id, value: "ok", via: "input" });
    await expect(pending).resolves.toMatchObject({ value: "ok" });
  });

  test("request rejects and forgets the pending id when the signal aborts", async () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const ac = new AbortController();
    const pending = sup.request({ kind: "input", message: "?", default: "d" }, ac.signal);
    ac.abort();
    await expect(pending).rejects.toThrow();
    // A late answer for the aborted id must not throw or resolve anything.
    const id = ch.sent[0].kind === "prompt" ? ch.sent[0].id : "";
    expect(() => ch.push({ kind: "answer", id, value: "late", via: "input" })).not.toThrow();
  });

  test("log and settled emit the right child messages", () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const entry = {
      sequence: 1,
      ts: 0,
      nodeId: "main",
      path: "main",
      level: "event",
      source: "lifecycle",
      message: "done · ok",
    };
    sup.log(entry);
    sup.settled(true, "/runs/dev-abc");
    expect(ch.sent).toEqual([
      { kind: "log", entry },
      { kind: "settled", ok: true, folder: "/runs/dev-abc" },
    ]);
  });

  test("onCancel fires when a cancel message arrives", () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    const onCancel = vi.fn();
    sup.onCancel(onCancel);
    ch.push({ kind: "cancel" });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  test("installSupervisor overrides the active supervisor (test seam)", () => {
    const ch = fakeChannel();
    const sup = createSupervisor(ch.send, ch.onMessage);
    expect(activeSupervisor()).toBeNull(); // unsupervised under vitest
    installSupervisor(sup);
    expect(activeSupervisor()).toBe(sup);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/interaction.test.ts`
Expected: FAIL — `Cannot find module '../../src/core/interaction.ts'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/omkit/src/core/interaction.ts
import type { LogEntry } from "../foundation/LogEntry.ts";

/**
 * A normalized prompt request the supervisor renders. The `prompt` action builds it;
 * `interaction.ts` treats it as an opaque payload (no dependency on the action layer,
 * so there is no core→actions import cycle).
 */
export interface PromptSpec {
  kind: "input" | "choice";
  message: string;
  default: string;
  choices?: { label: string; value: string }[];
}

// child → supervisor
export type ChildMessage =
  | { kind: "prompt"; id: string; spec: PromptSpec }
  | { kind: "log"; entry: LogEntry }
  | { kind: "settled"; ok: boolean; folder: string };

// supervisor → child
export type AnswerMessage = { kind: "answer"; id: string; value: string; via: string };
export type SupervisorMessage = AnswerMessage | { kind: "cancel" };

type Send = (message: ChildMessage) => void;
type OnMessage = (handler: (message: SupervisorMessage) => void) => void;

/**
 * The child-side handle to an out-of-process supervisor. Sends prompt requests, live log
 * entries, and the final verdict up the channel; resolves prompts when the matching answer
 * comes back; and invokes a cancel handler on a `cancel` message. Purely a transport — it
 * decides nothing (the child keeps its own prompt timeout; see the `prompt` action).
 */
export class Supervisor {
  private seq = 0;
  private readonly pending = new Map<string, (answer: AnswerMessage) => void>();
  private cancelHandler: (() => void) | undefined;

  constructor(
    private readonly send: Send,
    onMessage: OnMessage
  ) {
    onMessage((message) => {
      if (message.kind === "answer") {
        const resolve = this.pending.get(message.id);
        if (resolve) {
          this.pending.delete(message.id);
          resolve(message);
        }
      } else if (message.kind === "cancel") {
        this.cancelHandler?.();
      }
    });
  }

  request(spec: PromptSpec, signal: AbortSignal): Promise<AnswerMessage> {
    const id = `p${++this.seq}`;
    return new Promise<AnswerMessage>((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(id);
        reject(new Error("prompt aborted"));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, (answer) => {
        signal.removeEventListener("abort", onAbort);
        resolve(answer);
      });
      this.send({ kind: "prompt", id, spec });
    });
  }

  log(entry: LogEntry): void {
    this.send({ kind: "log", entry });
  }

  settled(ok: boolean, folder: string): void {
    this.send({ kind: "settled", ok, folder });
  }

  onCancel(handler: () => void): void {
    this.cancelHandler = handler;
  }
}

/** Build a supervisor over an arbitrary channel — used in tests and by {@link detect}. */
export function createSupervisor(send: Send, onMessage: OnMessage): Supervisor {
  return new Supervisor(send, onMessage);
}

/**
 * The real supervisor when this process was `fork`ed with an IPC channel and marked
 * supervised (`OMKIT_SUPERVISED=1`), else `null`. Detected once at import.
 */
function detect(): Supervisor | null {
  if (process.env.OMKIT_SUPERVISED !== "1" || typeof process.send !== "function") return null;
  const send: Send = (message) => void process.send!(message);
  const onMessage: OnMessage = (handler) =>
    process.on("message", (m) => handler(m as SupervisorMessage));
  return createSupervisor(send, onMessage);
}

let current: Supervisor | null = detect();

/** The active supervisor, or `null` when running bare. */
export function activeSupervisor(): Supervisor | null {
  return current;
}

/** Test seam: override the active supervisor (pass `null` to restore bare mode). */
export function installSupervisor(supervisor: Supervisor | null): void {
  current = supervisor;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/interaction.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/core/interaction.ts packages/omkit/tests/unit/interaction.test.ts
git commit -m "feat(omkit): add child-side supervisor interaction channel"
```

---

### Task 2: Route `prompt` over the supervisor when present (`actions/prompt.ts`)

**Files:**

- Modify: `packages/omkit/src/actions/prompt.ts:85-119`
- Test: `packages/omkit/tests/unit/prompt-supervised.test.ts`

**Interfaces:**

- Consumes: `activeSupervisor`, `installSupervisor`, `createSupervisor`, `type PromptSpec`, `type ChildMessage`, `type SupervisorMessage` from `../core/interaction.ts` (Task 1); `om` from `../index.ts`.
- Produces: no new exports — behavior change only. Supervised runs emit a `prompt` child-message with a normalized `PromptSpec` and resolve `prompt()` from the returned answer; bare runs are unchanged (readline); the timeout/teardown fallback holds in both modes.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/prompt-supervised.test.ts
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
    await om("ask", async () => {
      picked = await prompt({
        kind: "choice",
        message: "Deploy?",
        choices: ["no", "yes"],
        default: "no",
      }).result.then((o) => (o.ok ? o.value : "ERR"));
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
    await om("ask-timeout", async () => {
      picked = await prompt({ message: "Name?", default: "anon", timeoutMs: 20 }).result.then(
        (o) => (o.ok ? o.value : "ERR")
      );
    });

    expect(picked).toBe("anon");
    expect(sent.some((m) => m.kind === "prompt")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/prompt-supervised.test.ts`
Expected: FAIL — the first test times out or resolves to the default (`"no"`) because `prompt` still reads `readline` and ignores the supervisor; no `prompt` child-message is sent.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `packages/omkit/src/actions/prompt.ts` (below the existing imports):

```ts
import { activeSupervisor, type PromptSpec } from "../core/interaction.ts";
```

Replace the answer-acquisition block. The current code (lines 85–119) is:

```ts
    emit("prompt", message);

    const onTimeout = new AbortController();
    const timer = finite ? setTimeout(() => onTimeout.abort(), timeoutMs) : undefined;
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    let value = defaultValue;
    let via: PromptVia = "default";
    try {
      const raw = (
        await rl.question(query, { signal: AbortSignal.any([signal, onTimeout.signal]) })
      ).trim();
      if (raw === "") {
        via = "default";
      } else {
        const resolved = resolveRaw(raw);
        if (resolved !== undefined) {
          value = resolved;
          via = "input";
        } else {
          console.log(`invalid answer "${raw}", using default`);
          via = "default";
        }
      }
    } catch {
      via = onTimeout.signal.aborted ? "timeout" : "default";
    } finally {
      if (timer) clearTimeout(timer);
      rl.close();
    }

    console.log(via === "timeout" ? `timed out → ${value}` : `${value} (${via})`);
    attach(value); // resolves instance.ref → the answer
    emit("answer", { value, via });
    return value;
  });
```

Replace it with:

```ts
    emit("prompt", message);

    const onTimeout = new AbortController();
    const timer = finite ? setTimeout(() => onTimeout.abort(), timeoutMs) : undefined;
    const waitSignal = AbortSignal.any([signal, onTimeout.signal]);

    let value = defaultValue;
    let via: PromptVia = "default";
    const supervisor = activeSupervisor();
    try {
      if (supervisor) {
        // Supervised: hand the request to whoever owns the terminal (Ink app / MCP client).
        // The child still owns the timeout, so a silent supervisor can't wedge the run.
        const spec: PromptSpec = {
          kind: opts.kind === "choice" ? "choice" : "input",
          message,
          default: defaultValue,
          ...(opts.kind === "choice" ? { choices: asChoices(opts.choices) } : {}),
        };
        const answer = await supervisor.request(spec, waitSignal);
        const resolved = resolveRaw(answer.value);
        if (resolved !== undefined) {
          value = resolved;
          via = (answer.via as PromptVia) ?? "input";
        } else {
          value = defaultValue;
          via = "default";
        }
      } else {
        // Bare: read the terminal directly (unchanged).
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        try {
          const raw = (await rl.question(query, { signal: waitSignal })).trim();
          if (raw === "") {
            via = "default";
          } else {
            const resolved = resolveRaw(raw);
            if (resolved !== undefined) {
              value = resolved;
              via = "input";
            } else {
              console.log(`invalid answer "${raw}", using default`);
              via = "default";
            }
          }
        } finally {
          rl.close();
        }
      }
    } catch {
      via = onTimeout.signal.aborted ? "timeout" : "default";
    } finally {
      if (timer) clearTimeout(timer);
    }

    console.log(via === "timeout" ? `timed out → ${value}` : `${value} (${via})`);
    attach(value); // resolves instance.ref → the answer
    emit("answer", { value, via });
    return value;
  });
```

Note: `console.log` here is captured by omkit's `ConsoleCapture` into the run log — it does not fight the supervisor's terminal, so it is safe to keep in both modes.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/prompt-supervised.test.ts`
Expected: PASS (2 tests).

Then run the whole omkit suite to confirm the bare path still works:
Run: `npx vitest run packages/omkit`
Expected: PASS (all existing tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/actions/prompt.ts packages/omkit/tests/unit/prompt-supervised.test.ts
git commit -m "feat(omkit): route prompt over the supervisor channel when present"
```

---

### Task 3: Forward logs + verdict, accept cancel, suppress terminal under supervision (`core/ExecutionTree.ts`)

**Files:**

- Modify: `packages/omkit/src/core/ExecutionTree.ts` (constructor-adjacent `runRoot` at 222-241; `finalizeOnce` at 272-304; `printSummary` at 322-326)
- Test: `packages/omkit/tests/unit/execution-tree-supervised.test.ts`

**Interfaces:**

- Consumes: `activeSupervisor`, `installSupervisor`, `createSupervisor`, `type ChildMessage` from `./interaction.ts` (Task 1); the existing `LogStore.subscribe({ replay })` (see `ReadableLog`).
- Produces: when a supervisor is active, an om run (a) forwards every `LogEntry` as a `log` child-message, (b) emits exactly one `settled { ok, folder }` at finalize, (c) tears down on a `cancel` message, and (d) writes no curated milestones or summary to `process.stdout`. Bare runs are unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// packages/omkit/tests/unit/execution-tree-supervised.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/execution-tree-supervised.test.ts`
Expected: FAIL — no `log`/`settled` messages are ever sent (ExecutionTree doesn't know about the supervisor yet), and the stdout test finds the summary/milestones written.

- [ ] **Step 3: Write minimal implementation**

Add the import near the other core imports at the top of `packages/omkit/src/core/ExecutionTree.ts`:

```ts
import { activeSupervisor } from "./interaction.ts";
```

Add a private field alongside the existing `streaming` / `liveRendering` fields (near line 56-57):

```ts
  private forwarding: Promise<void> | undefined;
```

In `runRoot` (lines 230-233), replace:

```ts
this.streaming = this.rawStream.run(this.store);
// Live, curated milestones to the terminal — a single in-place status line on a TTY.
// Straight to process.stdout, which patch-console doesn't intercept (no capture feedback).
this.liveRendering = new LiveRenderer(process.stdout).run(this.store);
```

with:

```ts
this.streaming = this.rawStream.run(this.store);
const supervisor = activeSupervisor();
if (supervisor) {
  // Supervised: the supervisor owns the terminal. Forward every entry up the channel
  // instead of rendering, and tear down on its cancel request.
  supervisor.onCancel(() => this.cancel());
  this.forwarding = (async () => {
    for await (const entry of this.store.subscribe({ replay: true })) supervisor.log(entry);
  })();
} else {
  // Bare: live, curated milestones to the terminal — a single in-place status line on a TTY.
  // Straight to process.stdout, which patch-console doesn't intercept (no capture feedback).
  this.liveRendering = new LiveRenderer(process.stdout).run(this.store);
}
```

In `finalizeOnce`, replace the drain of the live streams (lines 280-282):

```ts
this.store.close();
await this.streaming;
await this.liveRendering;
```

with:

```ts
this.store.close();
await this.streaming;
await this.liveRendering;
await this.forwarding;
```

At the end of `finalizeOnce`, replace the tail (lines 301-303):

```ts
ExecutionTree.current = null;
this.printSummary(summary);
if (!this.verdictOk()) process.exitCode = 1;
```

with:

```ts
ExecutionTree.current = null;
const supervisor = activeSupervisor();
if (supervisor) supervisor.settled(this.verdictOk(), this.folder.path());
else this.printSummary(summary);
if (!this.verdictOk()) process.exitCode = 1;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/execution-tree-supervised.test.ts`
Expected: PASS (4 tests).

Then the full suite:
Run: `npx vitest run packages/omkit`
Expected: PASS (all existing + new tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/core/ExecutionTree.ts packages/omkit/tests/unit/execution-tree-supervised.test.ts
git commit -m "feat(omkit): forward logs/verdict and accept cancel under a supervisor"
```

---

### Task 4: Typecheck + lint gate

**Files:**

- No source changes — verification only.

- [ ] **Step 1: Typecheck the omkit package**

Run: `npm run typecheck --workspace omkit`
Expected: exit 0, no errors. (If `activeSupervisor()`'s null-narrowing or the `PromptSpec` shape trips a strict error, fix inline and re-run.)

- [ ] **Step 2: Lint**

Run: `npm run lint --workspace omkit`
Expected: exit 0.

- [ ] **Step 3: Full omkit test suite once more**

Run: `npx vitest run packages/omkit`
Expected: PASS.

- [ ] **Step 4: Commit any fixups**

```bash
git add -A packages/omkit
git commit -m "chore(omkit): typecheck/lint fixups for the interaction channel"
```

(Skip this commit if steps 1-3 were clean with no edits.)

---

## Plan A — Definition of Done

- `omkit` runs unchanged when unsupervised (all pre-existing tests green; bare `prompt` still uses `readline`; bare runs still print milestones + summary).
- When a supervisor is active: `prompt` requests/answers over the channel with its timeout intact; `ExecutionTree` forwards every `LogEntry`, emits one `settled { ok, folder }`, tears down on `cancel`, and writes nothing to `process.stdout`.
- Zero new dependencies; `typecheck` and `lint` clean.
- The exported surface of `core/interaction.ts` (`Supervisor`, `createSupervisor`, `activeSupervisor`, `installSupervisor`, message types, `PromptSpec`) is what Plan B's SDK (`cli/client/channel.ts`, `runner.ts`) consumes.
