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
import { command, healthcheck, chromePage } from "omkit/actions";

// Define once. `command` names the action after the command; calling it launches.
const api = command("npm run dev", { cwd: "api" });
const web = command("npm run dev", { cwd: "web" });

om("dev", async () => {
  api().tag("api"); // start both dev servers as daemons…
  web().tag("web");

  // …wait until the app actually serves (not just "process started")…
  const up = await healthcheck({ url: "http://localhost:3000" }).result;
  if (!up.ok) return; // gave up — the servers stay up so you can debug them

  // …then open it in a real browser and hand the live page downstream — typed, not scraped.
  const page = chromePage("app", "localhost:9222", { url: "http://localhost:3000" });
  console.log(`opened ${(await page.ref).url()}`);

  console.log("stack is up — press Ctrl+C to stop");
});
```

`page.ref` isn't a URL scraped from stdout — it's the live Playwright `Page`, typed, that the next step drives directly. Few workflow tools pass anything but strings between steps.

```
                      om()
                       │
      ┌────────────────┼────────────────┐
      ▼                ▼                 ▼
   command          healthcheck      chromePage
  api · web           (gate)           │ .ref  → live Page
  (daemons)                            ▼
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

### Outcomes — a result that doesn't throw

Every Activity settles to a typed **`Outcome`**, read via `activity.result`, which **never throws**. Operational failures are values you inspect, not exceptions you catch:

```ts
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

const tests = await command("npm test")().result;
if (!tests.ok) {
  // red tests are an expected outcome here — decide what to do, don't crash
}
```

Awaiting `.result` also _observes_ the Activity (see teardown). A cancelled Activity resolves `{ ok: false, error: CancelledError }`.

### Failure & teardown

omkit uses **structured supervision**: a failure that **nobody is watching** tears the whole run down and marks it failed. An Activity is "watched" if — before it fails — you awaited its `.result`, added an `on("error")` listener, or attached `.handleFailure`.

- **Await it** (`await task().result`) → the failure is yours to inspect as `{ ok: false }`; the run stays green.
- **Fire-and-forget it** (`task()`, never awaited) → an unobserved crash tears the run down. This is the guardrail for daemons: a dev server that dies fails the run instead of leaving it wedged.
- **`.handleFailure(fn)`** → own a fire-and-forget Activity's failure: `fn(error)` runs instead of tearing down.

```ts
web().tag("web"); // if the web daemon crashes, the run tears down — you'll know
flakyBackgroundJob().handleFailure((e) => console.warn("job failed, carrying on", e));
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
  if (out.ok && out.value === undefined) console.log("no changes — skipped the build");
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

**Gate a deploy on green tests.** Observe the outcome and branch — no try/catch:

```ts
om("ship", async () => {
  const tests = await command("npm test")().result;
  if (!tests.ok) return; // red → stop; the run stays green because you observed it
  await command("./deploy.sh")().result;
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
  if (answer.ok && answer.value === "yes") await command("./deploy.sh")().result;
});
```

## Events

An Activity exposes its declared events plus the lifecycle ones (`done`, `error`, `attached`):

- **`activity.on(event, handler)`** — subscribe to every emit.
- **`activity.once(event)`** — a **promise** for the next emit; resolves `undefined` if the Activity settles first, so an `await` never hangs. A retained snapshot (like `healthy`) is replayed immediately even if you subscribe late.
- **`activity.once("done")`** is the exception — it awaits the outcome itself: resolves the result on success, **rejects** on failure or cancellation (and observes the failure). That makes `await step().once("done")` a hard gate: a failed step throws at the `await`, in your body, instead of letting the orchestration sail past it. Use `.result` when a failure is an outcome you want to branch on rather than a stop.

```ts
const probe = healthcheck({ url: "http://localhost:3000" });
probe.on("healthy", (r) => console.log(`up after ${r.attempts} tries`));
```

## Batteries — `omkit/actions`

Reusable actions built on the core engine. For anything beyond these, drop down to `action(...).run(...)`.

- **`command`** — define a shell-command action, named after the command; output streams to the log, killed on teardown.
- **`watch`** / **`watchDir`** — watch a file or directory for changes (survives wipe + recreate).
- **`untilLog`** — gate on the first log entry matching a predicate.
- **`tailLog`** — tail a file another process writes, folding its lines into the combined log.
- **`healthcheck`** — poll a URL/port until the status (and optionally body) matches.
- **`prompt`** — ask the terminal for input or a choice, with a timeout that falls back to a default; the answer is its handle.
- **`chromePage`** — attach to Chrome over CDP — or to an existing Playwright `Page`/`Browser`/`Context`, including Electron windows — and expose the live `Page` as a handle.

## Install

```sh
npm install omkit
```

Requires Node ≥ 20.11. ESM only.

## License

MIT
