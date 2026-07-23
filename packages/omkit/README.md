# omkit

[![npm version](https://badge.fury.io/js/omkit.svg)](https://www.npmjs.com/package/omkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**The operational-model kit.** _Humans orchestrate. Runs narrate. AI assistants follow along._

A tiny runtime for the workflows _around_ your code — start servers, wait for health checks, build, watch, drive a browser, read state back, and tear it all down together. You write the orchestration as ordinary TypeScript; the run **narrates itself** into a structured, on-disk record — what launched, what came up, what attached, what failed, what the world actually looked like — that an AI assistant can read instead of guessing from terminal scrollback. Where [tskb](https://www.npmjs.com/package/tskb) is the _knowledge_ layer (what your system **is**), `omkit` is the _operational_ one (what it's **doing right now**).

## The problem

You know the script. Start the API, start the web server, wait until they're _actually_ serving, open the app, maybe run a smoke check — then Ctrl+C and hope everything shut down. Most of us glue this together with `concurrently`, `wait-on`, a shell script, and a pile of opaque interleaved output. When it breaks, you're grepping stdout to find out which process died.

Now hand that same script to an AI assistant. It has it even worse: interleaved stdout is all it can see, so it _infers_ — "the server probably started", "the build likely passed" — and acts on guesses. The productivity you wanted from the assistant leaks away into re-running things, misreading logs, and asserting success that never happened.

`omkit` models the workflow instead. Each step is a typed **action** in one run. Actions don't share globals — they hand each other typed **capabilities** (a port, a client, a live browser page), emit typed **events**, and land on **one log**. Bring the whole thing down together, and get a structured record of what happened — one a human can skim and an assistant can verify against.

```ts
import { om } from "omkit";
import { command, healthcheck, browser, chromePage } from "omkit/actions";

om("dev", async () => {
  // `command` names the action after the command and launches it — a normal action call.
  command("npm run dev", { cwd: "api" }).tag("api"); // start both dev servers as daemons…
  command("npm run dev", { cwd: "web" }).tag("web");

  // …wait until the app actually serves (not just "process started")…
  try {
    await healthcheck({ url: "http://localhost:3000" }).result;
  } catch {
    return; // never came up — the servers stay up so you can debug them
  }

  // …then launch a real browser and hand its live page downstream — typed, not scraped.
  const chrome = browser({ headless: false }); // a visible Chromium, closed on teardown
  const page = chromePage("app", chrome.ref, { url: "http://localhost:3000" });
  console.log(`opened ${(await page.ref).url()}`);

  console.log("stack is up — press Ctrl+C to stop");
});
```

`page.ref` isn't a URL scraped from stdout — it's the live Playwright `Page`, typed, that the next step drives directly. Few workflow tools pass anything but strings between steps.

```
                      om()
                       │
      ┌───────────┬────┴──────┬──────────────────┐
      ▼           ▼           ▼                   ▼
   command    healthcheck  browser  ──ref──▶  chromePage
  api · web     (gate)     (launch)           .ref → live Page
  (daemons)                                         │
                                                    ▼
                                            your smoke test
```

## Who it's for

- **Humans orchestrate.** Pipelines are ordinary TypeScript — `await`, `if`, loops, variables — not YAML, not a DSL. Define an action once; launch it by calling it.
- **AI assistants follow runs.** The run folder (`result.json`, `raw.jsonl`, per-action logs, snapshots) is a machine-readable account of what really happened — an assistant can verify outcomes, cite evidence, and pick up where a run left off.
- **Together, faster.** You express intent; the run records ground truth; the assistant acts on the record instead of re-running things to guess. Fewer cycles lost to "did that actually work?".

## Core concepts

### Actions & Activities

An **Action** is a named, typed description of work. **Calling it launches** it and returns a live **Activity** — the handle you configure (`withCache`, `tag`) and observe (`result`, `ref`, events).

```ts
import { action } from "omkit";

const build = action("build").run(({ proc }) => proc("tsc")`tsc -b`);

const activity = build(); // calling launches; returns the live Activity
```

`om(name, async (ctx) => …)` hosts the orchestration as the root of a run. The name plus the file it's defined in identify the run — logs land in `logs/<name>-<hash8>/…`, so same-named oms in different files never share a folder. You write ordinary `await` / `if` / loops / variables; the Activities you launch keep running in parallel, and because the body stays in-flight while you `await`, the run never idles shut between steps. Config chained synchronously on an Activity right after launching it (like `withCache`) applies before its body runs — the body commits one microtask later, so chain it in the same tick, before you `await`. For a one-off inline step, `step(name, fn)` runs `fn` as its own node without a reusable definition.

### Typed capabilities

An action can `attach` a value — a port, a client, a page — that downstream actions receive by awaiting `activity.ref`. Not a file descriptor scraped from a log: a typed runtime handoff, so steps chain without globals or string-parsing. The first `attach` wins; later ones are ignored. Unlike `.result`, `.ref` **rejects** on failure or cancellation — a consumer waiting on a capability that never arrives fails instead of hanging — and an action that publishes nothing still resolves its `.ref` with `undefined` on success, so awaiting it never wedges.

```ts
const server = action("server")
  .ref<number>() // this action publishes a port
  .run(async ({ attach, signal }) => {
    const port = await listen(); // start listening…
    attach(port); // …publish the port to downstream actions…
    await until(signal); // …and stay up until teardown
  });

const migrate = action("migrate").run((_ctx, port: Promise<number>) => runMigrations(port));

om("migrate", async () => {
  const s = server();
  migrate(s.ref); // migrate receives the port the moment the server attaches it — typed
});
```

### Results — one promise that rejects on failure

An Activity's **`.result`** resolves the value on success and **rejects** on failure — the same reject-on-failure shape as `.ref` and `.once`. A failure you want to branch on is a `try/catch`; one you want to note without stopping is a `.catch`. Reading `.result` also _observes_ the Activity (see teardown), so a handled failure doesn't tear the run down:

```ts
try {
  await command("npm test").result; // resolves on green, throws on red
} catch (err) {
  // red tests are an expected outcome here — decide what to do
}

// …or handle it inline, without stopping:
await command("npm test").result.catch((err) => report(err));
```

A cancelled Activity rejects with `CancelledError` — `isCancelled(err)` tells an intentional stop apart from a real fault.

### Failure & teardown

omkit uses **structured supervision**: a failure that **nobody is watching** tears the whole run down and marks it failed. An Activity is "watched" if — before it fails — you awaited its `.result`/`.ref`/`.once`, attached a `.result.catch`, or added an `on("error")` listener.

- **Await it** (`await task().result`) → a failure throws at the `await`, in your body; wrap it in `try/catch` to branch. The run stays green because you observed it.
- **Fire-and-forget it** (`task()`, never awaited) → an unobserved crash tears the run down. This is the guardrail for daemons: a dev server that dies fails the run instead of leaving it wedged.
- **`.result.catch(fn)`** → own a fire-and-forget Activity's failure: reading `.result` observes it, and `fn(error)` runs instead of tearing the run down (it also fires on cancel — guard with `isCancelled` if that matters).

```ts
command("npm run dev", { cwd: "web" }).tag("web"); // if it crashes, the run tears down — you'll know
flakyBackgroundJob().result.catch((e) => console.warn("job failed, carrying on", e));
```

**Ctrl+C** and **`ctx.cancel()`** tear everything down gracefully — procs are killed, waits unblock, the log is always written. And **success is keep-alive**: when your `om` body returns, the daemons it started keep running until Ctrl+C or `cancel()`, so wiring things up doesn't kill the servers you just started.

### One log, on disk — a run an assistant can follow

Every action's output, events, asserts, snapshots, and lifecycle land on **one timeline** — streamed live to the terminal (curated milestones) and written to a per-run folder:

- `result.json` — the run's tree, per-node status, and verdict.
- `raw.jsonl` — every entry, machine-readable.
- `main.log` + one `.log` per action — the human-readable timelines.
- `events.log` / `asserts.log` / `snapshots.log` — cross-cutting rollups.

`ctx` also gives each action `assert(cond, msg)` (tallies into the run's verdict) and `snapshot(name, value)` (captures JSON state to the run folder) — so a run is an inspectable artifact, not just an exit code.

Run folders have a **stable identity**: `logs/<name>-<hash8>/<date>/<time>/`, keyed by the om's name and the file that defines it. An assistant (or a script) can always find "the latest `tskb-dev` run" without parsing scrollback, diff two runs of the same pipeline, or answer questions with evidence instead of inference: _did the server actually pass its healthcheck? which process died first? what config did the build run with?_ It's all in the folder — attributed per action, timestamped, with a verdict.

### Observing the real world, not assuming it

The batteries are built around **ground truth**. `healthcheck` gates on the service actually answering, not on "process started". `chromePage` hands downstream steps a live browser page — real DOM, real network — so a smoke check inspects the app a user would see. `snapshot` freezes the inputs and state a run saw, and `assert` turns observations into a tallied verdict. For a human, that means less babysitting; for an AI assistant, it means the run folder **is** its view of the world — it follows what happened rather than imagining it.

## Common recipes

**Skip work that's already done.** `withCache` fingerprints inputs and skips the body when nothing changed since the last successful run (a hit resolves `undefined`):

```ts
const build = action("build").run(({ proc }) => proc("tsc")`tsc -b`);

om("build", async () => {
  const out = await build().withCache(`${process.cwd()}/src`).result;
  if (out === undefined) console.log("no changes — skipped the build");
});
```

**Watch and react.** Launch a watcher, subscribe to its events, and let the run stay alive:

```ts
import { watchDir } from "omkit/actions";

om("watch", async () => {
  const watcher = watchDir("src").tag("watch");
  watcher.on("update", (file) => console.log(`changed: ${file}`));
  // body returns, but the watcher keeps the run alive until Ctrl+C
});
```

**Gate a deploy on green tests.** A red test rejects at the `await`; catch it to branch:

```ts
om("ship", async () => {
  try {
    await command("npm test").result; // resolves on green, throws on red
  } catch {
    return; // red → stop; the run stays green because you observed the failure
  }
  await command("./deploy.sh").result;
});
```

**Keep a human in the loop.** `prompt` asks the terminal and falls back to a default when unattended, so it never blocks CI or an agent-driven run:

```ts
import { prompt } from "omkit/actions";

om("deploy", async () => {
  const answer = await prompt({
    kind: "choice",
    message: "Deploy to production?",
    choices: ["no", "yes"],
    default: "no",
    timeoutMs: 10_000, // no answer in 10s → "no"
  }).result;
  if (answer === "yes") await command("./deploy.sh").result;
});
```

## Events

An Activity exposes its declared events plus the lifecycle ones (`done`, `error`, `attached`):

- **`activity.on(event, handler)`** — subscribe to every emit.
- **`activity.once(event)`** — a **promise** for the next emit. Resolves the payload when it fires; if the Activity settles first it resolves `undefined` on success and **rejects** on failure/cancel — so a gate on an event surfaces a failure instead of hanging. A retained snapshot (like `healthy`) is replayed immediately even if you subscribe late.
- **`activity.once("done")`** is the outcome itself — identical to `.result` (resolve the value, reject on failure). `await step().once("done")` and `await step().result` are the same hard gate.

```ts
const probe = healthcheck({ url: "http://localhost:3000" });
probe.on("healthy", (r) => console.log(`up after ${r.attempts} tries`));
```

## Batteries — `omkit/actions`

Reusable actions built on the core engine. For anything beyond these, drop down to `action(...).run(...)`.

- **`command`** — run a shell command (or, with `args`, an executable) as an action named after it; output streams to the log, killed on teardown.
- **`watch`** / **`watchDir`** — watch a file or directory for changes (survives wipe + recreate).
- **`untilLog`** — gate on the first log entry matching a predicate.
- **`tailLog`** — tail a file another process writes, folding its lines into the combined log.
- **`healthcheck`** — poll a URL/port until the status (and optionally body) matches.
- **`prompt`** — ask the terminal for input or a choice, with a timeout that falls back to a default; the answer is its handle.
- **`browser`** — launch a Chromium browser with Playwright and expose the live `Browser` as a handle (defaults to the installed Chrome); closed on teardown. Feed its `.ref` to `chromePage`.
- **`chromePage`** — attach to Chrome over CDP, or to an existing Playwright `Page`/`Browser`/`Context` (including a `browser` handle or an Electron window), and expose the live `Page` as a handle.

## CLI

Point the `omkit` bin at a project — a `tsconfig.omkit.json` that lists your `oms/` and `actions/` — and it discovers, typechecks, and runs them. (Override the config path with `--tsconfig`.)

- **`omkit init`** — scaffold a starter project: `tsconfig.omkit.json`, a sample `oms/dev.ts`, and `actions/hello.ts`.
- **`omkit run`** — with no argument, open the interactive picker: browse and search your oms, run one, and watch its milestones stream live — answering any `prompt` in-console. A bare `omkit` does the same (`run` is the default command).
- **`omkit run <om>`** — run one om directly by name or file path, inheriting the terminal.
- **`omkit ls`** — list the discovered oms and actions.
- **`omkit check`** — typecheck the project (`tsc --noEmit`) and report diagnostics.

Each run is supervised in its own child process and narrated to a run folder (see above), whether you launch it from the picker or with `run <om>`.

## Install

```sh
npm install omkit
```

Requires Node ≥ 20.11. ESM only.

## License

MIT
