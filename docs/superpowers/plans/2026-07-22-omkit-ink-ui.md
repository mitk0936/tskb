# omkit Interactive Ink UI (Plan C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `omkit ui` (and bare `omkit`) — an interactive terminal app that lists/searches discovered oms, runs one as a supervised child, streams its live milestones, and answers its prompts in-console — plus the `milestones.ts` curation extraction and the LiveRenderer trim it enables.

**Architecture:** First, lift the pure milestone-curation logic (`format()`) out of `LiveRenderer` into `output/milestones.ts`, and shrink `LiveRenderer` to a plain append reporter (the in-place TTY redraw is retired now that Ink owns the interactive surface). Then build the Ink app under `cli/ui/` as thin React components over the Plan B1 `RunSession`: `OmList` (search + select), `RunView` (milestone lines + verdict), and `PromptView` (answer a pending prompt). `app.tsx` is the state machine that wires `createOmkitClient` → discover → list → run → view; `cli/commands/ui.ts` renders it; the `bin` routes `ui` (and the no-command default) to it. Presentational components and pure logic (`filterOms`) are unit-tested with `ink-testing-library`; the full run pipeline is already proven by Plan B1's runner integration test.

**Tech Stack:** TypeScript (NodeNext ESM, `.ts`/`.tsx` imports), React + Ink (terminal UI), `ink-testing-library`, Vitest. Consumes Plan B1's `createOmkitClient`/`RunSession` and Plan A's `format`-able `LogEntry`.

## Global Constraints

- **Node ≥ 20.11**, **ESM only**; `.ts`/`.tsx` extension imports.
- **`cli/ui/` is the only place `react`/`ink` are imported** — the client SDK and runtime stay UI-free (enforced by the `cli/client` eslint boundary).
- **Bare `omkit run` behavior after the trim:** the child's `LiveRenderer` appends plain milestone lines (no cursor control). The interactive surface is Ink, via `omkit ui`.
- **Components are testable** with `ink-testing-library`; pure logic (`filterOms`, `format`) is tested directly.
- **New dependencies:** `react`, `ink` (runtime); `@types/react`, `ink-testing-library` (dev). Add `"jsx": "react-jsx"` to `packages/omkit/tsconfig.json`.

---

### Task 1: Extract `output/milestones.ts` and trim `LiveRenderer`

**Files:**

- Create: `packages/omkit/src/output/milestones.ts`
- Modify: `packages/omkit/src/output/LiveRenderer.ts`
- Create: `packages/omkit/tests/unit/milestones.test.ts`
- Rewrite: `packages/omkit/tests/unit/live-renderer.test.ts`

**Interfaces:**

- Produces:
  - `milestones.ts` → `export interface Rendered { text: string; persist: boolean }` and `export function format(entry: LogEntry, tags?: readonly string[]): Rendered | null` — the curation: which entries are milestones, their icons, and whether they persist. Reused by `LiveRenderer` and the Ink `RunView`.
  - `LiveRenderer` shrinks to a plain append reporter over `format`; `LiveTerminal` narrows to `{ write(text: string): unknown }`.

- [ ] **Step 1: Write the `milestones` test (new curation home)**

```ts
// packages/omkit/tests/unit/milestones.test.ts
import { describe, expect, test } from "vitest";
import { format } from "../../src/output/milestones.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const e = (level: string, source: string, message: string, path = "main"): LogEntry =>
  ({ nodeId: path, path, level, source, message }) as unknown as LogEntry;

describe("format", () => {
  test("an action launch renders a ▶ pointer", () => {
    expect(format(e("child", "launch", "→ probe_1 · log"))?.text).toBe("▶ main/probe_1");
  });

  test("a failed lifecycle persists with a ✗", () => {
    const r = format(e("event", "lifecycle", "done · failed"));
    expect(r?.text).toContain("✗");
    expect(r?.persist).toBe(true);
  });

  test("an error shows only its first line", () => {
    const r = format(e("error", "error", "boom\nmore"));
    expect(r?.text).toContain("✗ main · boom");
    expect(r?.text).not.toContain("more");
  });

  test("tags decorate the node name", () => {
    const r = format(e("event", "ev", "ping", "main/hc_1"), ["ready"]);
    expect(r?.text).toBe("⚡ main/hc_1 [ready] · ping");
  });

  test("info/console entries are not milestones", () => {
    expect(format(e("info", "console", "hello"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/milestones.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `milestones.ts`** (move `format` + helpers out of `LiveRenderer`)

```ts
// packages/omkit/src/output/milestones.ts
import type { LogEntry } from "../foundation/LogEntry.ts";

/** A curated milestone line plus whether it must persist (vs. a transient status update). */
export interface Rendered {
  text: string;
  persist: boolean;
}

const firstLine = (message: string): string => message.split("\n", 1)[0] ?? message;

/** ✓ ok · ⊘ cancelled (a clean stop) · ✗ failed. */
const doneIcon = (status: string): string =>
  status === "ok" ? "✓" : status === "cancelled" ? "⊘" : "✗";

/** The node's path with its accumulated tags appended: `main/probe_9f3c [ready, gate]`. */
const named = (path: string, tags?: readonly string[]): string =>
  tags && tags.length ? `${path} [${tags.join(", ")}]` : path;

/** Map a curated log entry to a milestone line (and whether it persists), or `null` to drop it. */
export function format(e: LogEntry, tags?: readonly string[]): Rendered | null {
  if (e.level === "child" && e.source === "launch") {
    const child = e.message.replace(/^→\s*/, "").split(" · ")[0];
    return { text: `▶ ${e.path}/${child}`, persist: false };
  }
  if (e.level === "event" && e.source === "lifecycle") {
    if (e.message === "launched") return null;
    const status = e.message.replace(/^done · /, "");
    return {
      text: `${doneIcon(status)} ${named(e.path, tags)} · ${status}`,
      persist: status === "failed",
    };
  }
  if (e.level === "run") return { text: `· ${e.message}`, persist: true };
  if (e.level === "error" && e.source === "error") {
    return { text: `✗ ${named(e.path, tags)} · ${firstLine(e.message)}`, persist: true };
  }
  if (e.level === "event" && e.source === "cancel") {
    return { text: `⊘ ${named(e.path, tags)} · ${e.message}`, persist: true };
  }
  if (e.level === "event") {
    return { text: `⚡ ${named(e.path, tags)} · ${e.message}`, persist: false };
  }
  if (e.level === "assert") {
    return { text: `  ${named(e.path, tags)} · ${e.message}`, persist: e.message.includes("⊭") };
  }
  if (e.level === "snapshot") {
    return { text: `📸 ${named(e.path, tags)} · ${e.message}`, persist: false };
  }
  return null;
}
```

- [ ] **Step 4: Run the milestones test to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/milestones.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Trim `LiveRenderer.ts`** to a plain append reporter

Replace the entire contents of `packages/omkit/src/output/LiveRenderer.ts` with:

```ts
import type { LogStore } from "./log/LogStore.ts";
import { format } from "./milestones.ts";

/** The terminal surface the renderer appends to (process.stdout satisfies it). */
export interface LiveTerminal {
  write(text: string): unknown;
}

/**
 * Appends a **curated** stream of milestones — action launches, completions, errors, events,
 * asserts, snapshots — one line each, as the run goes. The in-place status-line rendering is
 * retired: the interactive surface is the Ink app (`omkit ui`); this reporter is the plain
 * output for bare `omkit run`, CI, and pipes. Writes through the given terminal directly (for
 * `process.stdout`, `patch-console` doesn't intercept it, so it can't feed console capture).
 */
export class LiveRenderer {
  /** Tags accumulated per node from `tag` entries, so milestones can show them by name. */
  private readonly tagsByNode = new Map<string, string[]>();

  constructor(private readonly term: LiveTerminal) {}

  async run(store: LogStore): Promise<void> {
    for await (const entry of store.subscribe({ replay: true })) {
      if (entry.level === "tag" && entry.source === "tag") {
        const list = this.tagsByNode.get(entry.nodeId) ?? [];
        list.push(entry.message);
        this.tagsByNode.set(entry.nodeId, list);
        continue; // tags aren't their own line — they decorate the node's milestones
      }
      const rendered = format(entry, this.tagsByNode.get(entry.nodeId));
      if (rendered === null) continue;
      this.term.write(`${rendered.text}\n`);
    }
  }
}
```

- [ ] **Step 6: Rewrite `live-renderer.test.ts`** to the plain-append behavior

Replace the entire contents of `packages/omkit/tests/unit/live-renderer.test.ts` with:

```ts
import { describe, expect, test } from "vitest";
import { LiveRenderer, type LiveTerminal } from "../../src/output/LiveRenderer.ts";
import type { LogStore } from "../../src/output/log/LogStore.ts";
import type { LogEntry } from "../../src/foundation/LogEntry.ts";

const entry = (level: string, source: string, message: string, path = "main"): LogEntry =>
  ({ nodeId: path, path, level, source, message }) as unknown as LogEntry;

const fakeStore = (entries: LogEntry[]): LogStore =>
  ({
    subscribe: () =>
      (async function* () {
        for (const e of entries) yield e;
      })(),
  }) as unknown as LogStore;

const capture = () => {
  const writes: string[] = [];
  const term: LiveTerminal = { write: (t) => writes.push(t) };
  return { term, writes };
};

describe("LiveRenderer", () => {
  test("appends every milestone on its own line (no control codes)", async () => {
    const { term, writes } = capture();
    await new LiveRenderer(term).run(
      fakeStore([entry("child", "launch", "→ probe_1 · log"), entry("event", "e", "ping")])
    );
    expect(writes).toEqual(["▶ main/probe_1\n", "⚡ main · ping\n"]);
  });

  test("shows a node's tags next to its name once tagged", async () => {
    const { term, writes } = capture();
    await new LiveRenderer(term).run(
      fakeStore([
        entry("tag", "tag", "explorer:ready", "main/hc_1"),
        entry("event", "e", "ping", "main/hc_1"),
      ])
    );
    expect(writes).toEqual(["⚡ main/hc_1 [explorer:ready] · ping\n"]);
  });

  test("an error is appended as its first line only", async () => {
    const { term, writes } = capture();
    await new LiveRenderer(term).run(fakeStore([entry("error", "error", "boom\nmore")]));
    expect(writes).toEqual(["✗ main · boom\n"]);
  });
});
```

- [ ] **Step 7: Run both renderer tests + the full suite**

Run: `npx vitest run packages/omkit/tests/unit/milestones.test.ts packages/omkit/tests/unit/live-renderer.test.ts`
Expected: PASS.
Run: `npx vitest run packages/omkit`
Expected: PASS (the supervised-suppression and other tests still green — `LiveRenderer` isn't started under supervision anyway).

- [ ] **Step 8: Commit**

```bash
git add packages/omkit/src/output/milestones.ts packages/omkit/src/output/LiveRenderer.ts packages/omkit/tests/unit/milestones.test.ts packages/omkit/tests/unit/live-renderer.test.ts
git commit -m "Extract milestone curation and trim LiveRenderer to a plain reporter"
```

---

### Task 2: Add React + Ink and enable JSX

**Files:**

- Modify: `packages/omkit/package.json` (deps)
- Modify: `packages/omkit/tsconfig.json` (`jsx`)

- [ ] **Step 1: Install dependencies**

Run:

```bash
npm install react ink --workspace omkit
npm install -D @types/react ink-testing-library --workspace omkit
```

Expected: `react` + `ink` under `dependencies`, `@types/react` + `ink-testing-library` under `devDependencies`. If a peer-range conflict appears, pin to a compatible set (e.g. `ink@5`, `react@18`, `@types/react@18`, `ink-testing-library@4`) and re-run.

- [ ] **Step 2: Enable the react-jsx runtime**

Add `"jsx": "react-jsx"` to `compilerOptions` in `packages/omkit/tsconfig.json` (after `"target"`):

```jsonc
"target": "ES2023",
"jsx": "react-jsx",
```

- [ ] **Step 3: Verify the toolchain compiles JSX**

Create a throwaway `packages/omkit/src/cli/ui/_probe.tsx` containing:

```tsx
import { Text } from "ink";
export const Probe = () => <Text>ok</Text>;
```

Run: `npm run typecheck --workspace omkit`
Expected: exit 0 (JSX + Ink types resolve). Then delete `_probe.tsx`.

- [ ] **Step 4: Commit**

```bash
git add packages/omkit/package.json packages/omkit/tsconfig.json packages/omkit/package-lock.json
git commit -m "Add react + ink and enable the react-jsx runtime"
```

---

### Task 3: `filterOms` + the `OmList` view (`cli/ui/views/OmList.tsx`)

**Files:**

- Create: `packages/omkit/src/cli/ui/views/OmList.tsx`
- Test: `packages/omkit/tests/unit/om-list.test.tsx`

**Interfaces:**

- Consumes: `DiscoveredOm` from `../../client/registry.ts`; `Box`, `Text`, `useInput` from `ink`; `useState` from `react`.
- Produces:
  - `export function filterOms(oms: DiscoveredOm[], query: string): DiscoveredOm[]` — case-insensitive name substring filter.
  - `export function OmList({ oms, onSelect }: { oms: DiscoveredOm[]; onSelect: (om: DiscoveredOm) => void }): JSX.Element` — a searchable, arrow-navigable list; Enter selects.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/omkit/tests/unit/om-list.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { filterOms, OmList } from "../../src/cli/ui/views/OmList.tsx";
import type { DiscoveredOm } from "../../src/cli/client/registry.ts";

const oms: DiscoveredOm[] = [
  { name: "dev", file: "/p/oms/dev.ts", line: 1 },
  { name: "deploy", file: "/p/oms/deploy.ts", line: 1 },
  { name: "build", file: "/p/oms/build.ts", line: 1 },
];

describe("filterOms", () => {
  test("case-insensitive name substring", () => {
    expect(filterOms(oms, "DE").map((o) => o.name)).toEqual(["dev", "deploy"]);
    expect(filterOms(oms, "").length).toBe(3);
  });
});

describe("OmList", () => {
  test("renders all om names initially", () => {
    const { lastFrame } = render(<OmList oms={oms} onSelect={() => {}} />);
    expect(lastFrame()).toContain("dev");
    expect(lastFrame()).toContain("deploy");
    expect(lastFrame()).toContain("build");
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/om-list.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `OmList.tsx`**

```tsx
// packages/omkit/src/cli/ui/views/OmList.tsx
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { DiscoveredOm } from "../../client/registry.ts";

/** Case-insensitive substring filter on om names. */
export function filterOms(oms: DiscoveredOm[], query: string): DiscoveredOm[] {
  const q = query.toLowerCase();
  return oms.filter((o) => o.name.toLowerCase().includes(q));
}

/** A searchable, arrow-navigable list of oms; Enter selects the highlighted one. */
export function OmList({
  oms,
  onSelect,
}: {
  oms: DiscoveredOm[];
  onSelect: (om: DiscoveredOm) => void;
}): JSX.Element {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const filtered = filterOms(oms, query);

  useInput((input, key) => {
    if (key.upArrow) {
      setIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (key.return) {
      const picked = filtered[index];
      if (picked) onSelect(picked);
    } else if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setIndex(0);
    } else if (input && !key.ctrl && !key.meta) {
      setQuery((q) => q + input);
      setIndex(0);
    }
  });

  return (
    <Box flexDirection="column">
      <Text>search: {query}</Text>
      {filtered.map((o, i) => (
        <Text key={o.name} inverse={i === index}>
          {o.name} {o.file}
        </Text>
      ))}
    </Box>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/om-list.test.tsx`
Expected: PASS (3 tests). If `useInput` warns about raw mode under the test stdin, `ink-testing-library` provides a raw-mode-capable stdin — ensure the component is rendered via its `render`, not React's.

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/cli/ui/views/OmList.tsx packages/omkit/tests/unit/om-list.test.tsx
git commit -m "Add the OmList search/select view"
```

---

### Task 4: `RunView` + `PromptView` (`cli/ui/views/RunView.tsx`)

**Files:**

- Create: `packages/omkit/src/cli/ui/views/RunView.tsx`
- Test: `packages/omkit/tests/unit/run-view.test.tsx`

**Interfaces:**

- Consumes: `PromptRequest`, `Verdict` from `../../client/types.ts`; `Box`, `Text`, `useInput` from `ink`; `useState` from `react`.
- Produces:
  - `export function PromptView({ request, onAnswer }: { request: PromptRequest; onAnswer: (value: string) => void }): JSX.Element` — renders an input or choice prompt; Enter (input) / arrow+Enter (choice) answers.
  - `export function RunView({ lines, prompt, verdict, onAnswer }: { lines: string[]; prompt?: PromptRequest; verdict?: Verdict; onAnswer: (value: string) => void }): JSX.Element` — the milestone log, a live prompt (if any), and the final verdict.

- [ ] **Step 1: Write the failing test**

```tsx
// packages/omkit/tests/unit/run-view.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render } from "ink-testing-library";
import { RunView, PromptView } from "../../src/cli/ui/views/RunView.tsx";
import type { PromptRequest } from "../../src/cli/client/types.ts";

describe("RunView", () => {
  test("renders milestone lines and the verdict", () => {
    const { lastFrame } = render(
      <RunView
        lines={["▶ main/probe", "✓ main · ok"]}
        verdict={{ ok: true, folder: "/r" }}
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/run-view.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `RunView.tsx`**

```tsx
// packages/omkit/src/cli/ui/views/RunView.tsx
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { PromptRequest, Verdict } from "../../client/types.ts";

/** Answer one pending prompt — free-text input, or arrow-navigable choices. */
export function PromptView({
  request,
  onAnswer,
}: {
  request: PromptRequest;
  onAnswer: (value: string) => void;
}): JSX.Element {
  const { spec } = request;
  const choices = spec.choices ?? [];
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);

  useInput((input, key) => {
    if (spec.kind === "choice") {
      if (key.upArrow) setIndex((i) => Math.max(0, i - 1));
      else if (key.downArrow) setIndex((i) => Math.min(choices.length - 1, i + 1));
      else if (key.return) onAnswer(choices[index]?.value ?? spec.default);
    } else {
      if (key.return) onAnswer(text === "" ? spec.default : text);
      else if (key.backspace || key.delete) setText((t) => t.slice(0, -1));
      else if (input && !key.ctrl && !key.meta) setText((t) => t + input);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{spec.message}</Text>
      {spec.kind === "choice" ? (
        choices.map((c, i) => (
          <Text key={c.value} inverse={i === index}>
            {c.value === spec.default ? "* " : "  "}
            {c.label}
          </Text>
        ))
      ) : (
        <Text>
          {"> "}
          {text}
        </Text>
      )}
    </Box>
  );
}

/** The live run surface: milestone lines, a pending prompt, and the final verdict. */
export function RunView({
  lines,
  prompt,
  verdict,
  onAnswer,
}: {
  lines: string[];
  prompt?: PromptRequest;
  verdict?: Verdict;
  onAnswer: (value: string) => void;
}): JSX.Element {
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      {prompt ? <PromptView request={prompt} onAnswer={onAnswer} /> : null}
      {verdict ? (
        <Text color={verdict.ok ? "green" : "red"}>
          {verdict.ok ? "✓ ok" : "✗ failed"} · {verdict.folder}
        </Text>
      ) : null}
    </Box>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/run-view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/omkit/src/cli/ui/views/RunView.tsx packages/omkit/tests/unit/run-view.test.tsx
git commit -m "Add the RunView and PromptView"
```

---

### Task 5: `app.tsx` state machine + `ui` command + bin wiring

**Files:**

- Create: `packages/omkit/src/cli/ui/app.tsx`
- Create: `packages/omkit/src/cli/commands/ui.ts`
- Modify: `packages/omkit/src/cli/index.ts` (route `ui`)
- Test: `packages/omkit/tests/unit/app.test.tsx`

**Interfaces:**

- Consumes: `OmkitClient`, `RunSession`, `PromptRequest`, `Verdict` from `../client/index.ts`; `format` from `../../output/milestones.ts`; `OmList`, `RunView` from `./views/…`; `render` from `ink`.
- Produces:
  - `app.tsx` → `export function App({ client }: { client: OmkitClient }): JSX.Element` — discovers oms, shows `OmList`; on select, calls `client.run(file)` and renders `RunView` fed by the session's `log`/`prompt`/`settled` events.
  - `ui.ts` → `export function launchUi(client: OmkitClient): void` — renders `<App>` with Ink.
  - bin routes `ui` (and the default command) to `launchUi`.

- [ ] **Step 1: Write the failing test** (fake client + fake session — no real fork)

```tsx
// packages/omkit/tests/unit/app.test.tsx
import { describe, expect, test } from "vitest";
import { render } from "ink-testing-library";
import { App } from "../../src/cli/ui/app.tsx";
import type { OmkitClient, RunSession, RunEvents } from "../../src/cli/client/types.ts";
import type { Registry } from "../../src/cli/client/registry.ts";

/** A fake session whose handlers the test can fire. */
function fakeSession() {
  const handlers: Partial<Record<keyof RunEvents, Function>> = {};
  const session: RunSession = {
    on: (event, handler) => void (handlers[event] = handler as Function),
    answer: () => {},
    cancel: () => {},
    result: Promise.resolve({ ok: true, folder: "/r" }),
  };
  return { session, fire: handlers };
}

function fakeClient(session: RunSession): OmkitClient {
  const registry: Registry = {
    oms: [{ name: "dev", file: "/p/oms/dev.ts", line: 1 }],
    actions: [],
    warnings: [],
  };
  return {
    discover: async () => registry,
    run: () => session,
    check: async () => [],
  };
}

describe("App", () => {
  test("lists discovered oms, then streams a run's milestones on select", async () => {
    const { session, fire } = fakeSession();
    const { lastFrame, stdin } = render(<App client={fakeClient(session)} />);

    await new Promise((r) => setTimeout(r, 30)); // discover resolves
    expect(lastFrame()).toContain("dev");

    stdin.write("\r"); // select "dev" → client.run
    await new Promise((r) => setTimeout(r, 20));
    // Feed a log milestone over the fake session.
    (fire.log as (e: unknown) => void)?.({
      sequence: 1,
      ts: 0,
      nodeId: "main",
      path: "main",
      level: "event",
      source: "ev",
      message: "ping",
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(lastFrame()).toContain("ping");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/omkit/tests/unit/app.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `app.tsx`**

```tsx
// packages/omkit/src/cli/ui/app.tsx
import { useEffect, useState } from "react";
import { format } from "../../output/milestones.ts";
import { OmList } from "./views/OmList.tsx";
import { RunView } from "./views/RunView.tsx";
import type { OmkitClient, RunSession, PromptRequest, Verdict } from "../client/types.ts";
import type { DiscoveredOm } from "../client/registry.ts";

/** The interactive app: discover → list/search → run → live milestones + prompts. */
export function App({ client }: { client: OmkitClient }): JSX.Element {
  const [oms, setOms] = useState<DiscoveredOm[]>([]);
  const [session, setSession] = useState<RunSession | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [prompt, setPrompt] = useState<PromptRequest | undefined>();
  const [verdict, setVerdict] = useState<Verdict | undefined>();

  useEffect(() => {
    let live = true;
    void client.discover().then((r) => {
      if (live) setOms(r.oms);
    });
    return () => {
      live = false;
    };
  }, [client]);

  const run = (om: DiscoveredOm): void => {
    const s = client.run(om.file);
    s.on("log", (entry) => {
      const rendered = format(entry);
      if (rendered) setLines((prev) => [...prev, rendered.text]);
    });
    s.on("prompt", (req) => setPrompt(req));
    s.on("settled", (v) => {
      setVerdict(v);
      setPrompt(undefined);
    });
    setSession(s);
  };

  const answer = (value: string): void => {
    if (session && prompt) session.answer(prompt.id, value);
    setPrompt(undefined);
  };

  if (!session) return <OmList oms={oms} onSelect={run} />;
  return <RunView lines={lines} prompt={prompt} verdict={verdict} onAnswer={answer} />;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/omkit/tests/unit/app.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Write `ui.ts` and wire the bin**

```ts
// packages/omkit/src/cli/commands/ui.ts
import { render } from "ink";
import { App } from "../ui/app.tsx";
import type { OmkitClient } from "../client/index.ts";

/** Render the interactive Ink app for a client. */
export function launchUi(client: OmkitClient): void {
  render(<App client={client} />);
}
```

(Note: `ui.ts` uses JSX, so name it `ui.tsx`. Rename the file to `packages/omkit/src/cli/commands/ui.tsx`.)

In `packages/omkit/src/cli/index.ts`, replace the trailing stub:

```ts
// "ui" (and bare `omkit`) is delivered in Plan C.
console.error(`the "${cli.command}" command is not available yet`);
process.exitCode = 1;
```

with:

```ts
if (cli.command === "ui") {
  const { launchUi } = await import("./commands/ui.tsx");
  launchUi(client);
  return;
}
console.error(`unknown command "${cli.command}"`);
process.exitCode = 1;
```

- [ ] **Step 6: Build + smoke-test**

Run: `npm run build --workspace omkit`
Expected: exit 0; `dist/cli/commands/ui.js` and `dist/cli/ui/app.js` exist.

Manual smoke (interactive — run in a real terminal, not CI):
`cd packages/omkit/tests/fixtures/discovery && node ../../../dist/cli/index.js ui --tsconfig tsconfig.omkit.json`
Expected: an interactive list of `dev` / `build`; typing filters; Enter runs; Ctrl+C exits.

- [ ] **Step 7: Commit**

```bash
git add packages/omkit/src/cli/ui/app.tsx packages/omkit/src/cli/commands/ui.tsx packages/omkit/src/cli/index.ts packages/omkit/tests/unit/app.test.tsx
git commit -m "Add the interactive Ink app and wire the ui command"
```

---

### Task 6: tskb boundary docs, gates, and final verification

**Files:**

- Modify: `docs/src/omkit/cli.tskb.tsx` (register `omkit.cli.ui` + `omkit.cli.commands` under the CLI boundary)
- Verification only otherwise.

- [ ] **Step 1: Register the new CLI sub-areas** in `docs/src/omkit/cli.tskb.tsx`

Add to the `Folders` block:

```tsx
"omkit.cli.commands": Folder<{
  desc: "The CLI command adapters: init, ls, check, run, and ui — thin frontends over the client SDK.";
  path: "packages/omkit/src/cli/commands";
}>;

"omkit.cli.ui": Folder<{
  desc: "The interactive Ink app: search oms, run one, stream live milestones, and answer prompts in-console.";
  path: "packages/omkit/src/cli/ui";
}>;
```

Add a `Module` for the app and a ref, then one `<Relation>` in the doc body:

```tsx
"omkit.cli.ui.app": Module<{
  desc: "The interactive app's state machine: discover → list → run → live view.";
  type: typeof import("packages/omkit/src/cli/ui/app.js");
}>;
```

```tsx
const UiFolder = ref as tskb.Folders["omkit.cli.ui"];
const RunSessionExport2 = ref as tskb.Exports["omkit.RunSession"]; // reuse existing ref if present
// in the <Doc> body:
<Relation from={UiFolder} to={RunSessionExport} label="renders live from" />;
```

- [ ] **Step 2: Rebuild the docs graph**

Run: `npm run build:docs`
Expected: `✓ Done!` — all new folder/module registrations resolve.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck --workspace omkit`
Expected: exit 0.

- [ ] **Step 4: Lint**

Run: `npm run lint --workspace omkit`
Expected: 0 errors. (The Ink `.tsx` files import `react`/`ink`; ensure the `cli/client` boundary rule still passes — the UI is outside `client/`.)

- [ ] **Step 5: Full suite**

Run: `npx vitest run packages/omkit`
Expected: PASS (Plan A/B1/B2 + milestones (5), live-renderer (3, rewritten), om-list (3), run-view (3), app (1)).

- [ ] **Step 6: Commit**

```bash
git add docs/src/omkit/cli.tskb.tsx .claude .github
git commit -m "Document the omkit CLI commands and Ink UI sub-areas"
```

---

## Plan C — Definition of Done

- `omkit ui` (and bare `omkit`) launches an interactive app: search/select an om, run it, watch live milestones, and answer prompts in-console.
- Milestone curation lives in `output/milestones.ts`, shared by the plain `LiveRenderer` and the Ink `RunView`; the in-place TTY renderer is retired.
- `react`/`ink` are imported only under `cli/ui/`; the client SDK and runtime stay UI-free.
- The tskb graph documents `omkit.cli.commands` and `omkit.cli.ui` under the `omkit CLI` boundary.
- `typecheck`, `lint`, the docs build, and the full suite are green.
