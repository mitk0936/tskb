# omkit

[![npm version](https://badge.fury.io/js/omkit.svg)](https://www.npmjs.com/package/omkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**The operational-model kit.** _Humans orchestrate. Runs narrate. AI assistants follow along._

A tiny runtime for the workflows _around_ your code — start servers, wait for health checks, build, watch, drive a browser, read state back, and tear it all down together. You write the orchestration as ordinary TypeScript; the run **narrates itself** into a structured, on-disk record — what launched, what came up, what attached, what failed, what the world actually looked like — that an AI assistant can read instead of guessing from terminal scrollback. Where [tskb](https://www.npmjs.com/package/tskb) is the _knowledge_ layer (what your system **is**), `omkit` is the _operational_ one (what it's **doing right now**).

## Migrating from om(name, body)

`om(name, body)` was removed in 0.5.0. `om(name)` now returns a builder, and `.run(body)` takes the place of the second argument:

```diff
-om("dev", async (ctx) => {
+om("dev").run(async (ctx) => {
   // ...
 });
```

Run folders are unaffected — a run's identity is its name plus its defining file, and line numbers are not part of the hash, so migrating a call site keeps its history.

## The problem

You know the script. Start the API, start the web server, wait until they're _actually_ serving, open the app, maybe run a smoke check — then Ctrl+C and hope everything shut down. Most of us glue this together with `concurrently`, `wait-on`, a shell script, and a pile of opaque interleaved output. When it breaks, you're grepping stdout to find out which process died.

Now hand that same script to an AI assistant. It has it even worse: interleaved stdout is all it can see, so it _infers_ — "the server probably started", "the build likely passed" — and acts on guesses. The productivity you wanted from the assistant leaks away into re-running things, misreading logs, and asserting success that never happened.

`omkit` models the workflow instead. Each step is a typed **action** in one run. Actions don't share globals — they hand each other typed **capabilities** (a port, a client, a live browser page), emit typed **events**, and land on **one log**. Bring the whole thing down together, and get a structured record of what happened — one a human can skim and an assistant can verify against.

```ts
import { om } from "omkit";
import { command, healthcheck, browser, chromePage } from "omkit/actions";

om("dev").run(async () => {
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
  const page = chromePage("app", await chrome.ref, { url: "http://localhost:3000" });
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

Chain `.describe({ summary })` before `.run(...)` to attach a human-readable summary — stored on the definition, for `omkit ls` and future tooling to read; nothing reads it yet, so today it is documentation that travels with the code. Same shape as `om`'s, below. `.args(schema)` pins the type of `.run`'s second parameter to a zod schema's inferred type. It's **type-level only**: nothing here resolves, prompts for, or validates the value — an action launched from an om body is passed its arguments directly in code, so the schema exists to type that call site, not to gate it. (Resolving/prompting for arguments is an `om`-level concern, not `action`'s.)

```ts
import { z } from "zod";

const seed = action("seed")
  .describe({ summary: "Seeds the database" })
  .args(z.object({ rows: z.number() }))
  .run(async (_ctx, { rows }) => {
    /* rows: number — typed, not validated */
  });

seed({ rows: 500 }); // calling launches it; the shape is pinned, not checked at runtime
```

`om(name).run(async (ctx) => …)` hosts the orchestration as the root of a run. `om(name)` returns a builder: chain `.describe({ summary })` to attach a human-readable summary (stored on the run; nothing reads it yet) and/or `.args(schema)` to declare what the run needs, then finish with `.run(body)`, which launches it. The name plus the file it's defined in identify the run — logs land in `logs/<name>-<hash8>/…`, so same-named oms in different files never share a folder. You write ordinary `await` / `if` / loops / variables; the Activities you launch keep running in parallel, and because the body stays in-flight while you `await`, the run never idles shut between steps. Config chained synchronously on an Activity right after launching it (like `withCache`) applies before its body runs — the body commits one microtask later, so chain it in the same tick, before you `await`. For a one-off inline step, `step(name, fn)` runs `fn` as its own node without a reusable definition.

### Run arguments — `om(name).args(schema)`

An om declares what it needs, and omkit fills it in. Unlike `action`'s `.args()`, this one is **resolved at runtime**: `.run`'s body receives the resolved, validated values as its second parameter, typed by the schema.

```ts
import { z } from "zod";

om("seed")
  .args(z.object({ rows: z.number(), truncate: z.boolean().default(false) }))
  .run(async (ctx, args) => {
    // args: { rows: number; truncate: boolean } — already resolved and validated
    await command(`./seed.sh --rows ${args.rows}`).result;
  });
```

Each field is filled from the first of these that can answer:

1. **Supplied** — `OMKIT_ARGS`, a JSON object in the environment. It is read once at run start and then cleared, so a subprocess the run spawns doesn't inherit one om's args and resolve them against another's schema.
2. **Defaults** — anything the schema defaults, which is therefore never asked about.
3. **Prompt** — whatever is still missing, one field at a time, with a one-line type sketch (`rows (number)`). Objects and arrays are asked for as a multiline JSON block — paste it, or answer with the path to a JSON file. A blank answer is _no answer_, not a value: it re-asks rather than coercing (`Number("")` is `0`). Resolution gives up after three rounds.
4. **Fail** — if nobody can be asked (no supervising picker and no TTY), the run fails naming every unresolved field at once, instead of prompting into the void.

Resolution happens **inside** the run, so a prompt and its answer land on the run's own timeline, and the values it settled on are recorded in `result.json` and the `main.log` header — a later reader can see exactly what the run was given.

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

om("migrate").run(async () => {
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

- `result.json` — the run's tree, per-node status, verdict, and curated artifacts.
- `raw.jsonl` — every entry, machine-readable.
- `main.log` + one `.log` per action — the human-readable timelines.
- `events.log` / `asserts.log` / `snapshots.log` / `artifacts.log` — cross-cutting rollups.

`ctx` also gives each action `assert(cond, msg)` (tallies into the run's verdict), `snapshot(name, value)` (captures JSON state to the run folder), and `artifact(name, file, opts?)` (labels a file the action wrote — name, optional description, MIME inferred from the extension — and returns its absolute path) — so a run is an inspectable artifact, not just an exit code. Write the files you label under `ctx.artifactsFolder`, the run's own output folder.

Run folders have a **stable identity**: `logs/<name>-<hash8>/<date>/<time>/`, keyed by the om's name and the file that defines it. An assistant (or a script) can always find "the latest `tskb-dev` run" without parsing scrollback, diff two runs of the same pipeline, or answer questions with evidence instead of inference: _did the server actually pass its healthcheck? which process died first? what config did the build run with?_ It's all in the folder — attributed per action, timestamped, with a verdict.

### Observing the real world, not assuming it

The batteries are built around **ground truth**. `healthcheck` gates on the service actually answering, not on "process started". `chromePage` hands downstream steps a live browser page — real DOM, real network — so a smoke check inspects the app a user would see. `snapshot` freezes the inputs and state a run saw, and `assert` turns observations into a tallied verdict. For a human, that means less babysitting; for an AI assistant, it means the run folder **is** its view of the world — it follows what happened rather than imagining it.

## Common recipes

**Skip work that's already done.** `withCache` fingerprints inputs and skips the body when nothing changed since the last successful run (a hit resolves `undefined`):

```ts
const build = action("build").run(({ proc }) => proc("tsc")`tsc -b`);

om("build").run(async () => {
  const out = await build().withCache(`${process.cwd()}/src`).result;
  if (out === undefined) console.log("no changes — skipped the build");
});
```

**Watch and react.** Launch a watcher, subscribe to its events, and let the run stay alive:

```ts
import { watchDir } from "omkit/actions";

om("watch").run(async () => {
  const watcher = watchDir("src").tag("watch");
  watcher.on("update", (file) => console.log(`changed: ${file}`));
  // body returns, but the watcher keeps the run alive until Ctrl+C
});
```

**Gate a deploy on green tests.** A red test rejects at the `await`; catch it to branch:

```ts
om("ship").run(async () => {
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

om("deploy").run(async () => {
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

**Take a block of text.** `kind: "multiline"` reads lines until `until` says stop: parseable JSON (the default), a sentinel line, or a predicate over the text so far. The JSON default is self-terminating, so a pretty-printed blob can be pasted straight in with nothing to explain:

```ts
om("seed").run(async () => {
  const blob = await prompt({
    kind: "multiline",
    message: "Paste the service config",
    hint: "{ host: string; port: number }", // a one-line type sketch, shown under the message
    until: "json", // the default; or "." to end on that line, or (text) => text.length > 500
  }).result;
  const config = JSON.parse(blob);
  await command(`./seed.sh --host ${config.host}`).result;
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
- **`portFree`** — the mirror of `healthcheck`: poll a TCP port until nothing is listening, so a restart can rebind without racing the old process.
- **`prompt`** — ask the terminal for input, a choice, or a multiline block, with a timeout that falls back to a default; the answer is its handle.
- **`browser`** — launch a Chromium browser with Playwright and expose the live `Browser` as a handle (defaults to the installed Chrome); closed on teardown. Feed its `.ref` to `chromePage`.
- **`chromePage`** — attach to Chrome over CDP, or to an existing Playwright `Page`/`Browser`/`Context` (including a `browser` handle or an Electron window), and expose the live `Page` as a handle.

## CLI

Point the `omkit` bin at a project — a `tsconfig.omkit.json` that lists your `oms/` and `actions/` — and it discovers, typechecks, and runs them. (Override the config path with `--tsconfig`.)

- **`omkit init`** — scaffold a starter project: `tsconfig.omkit.json`, a sample `oms/dev.ts`, and `actions/hello.ts`.
- **`omkit run`** — with no argument, open the interactive picker: browse and search your oms, run one, and watch its milestones stream live — answering any `prompt` in-console. A bare `omkit` does the same (`run` is the default command).
- **`omkit run <om>`** — run one om directly by name or file path, inheriting the terminal.
- **`omkit ls`** — list the discovered oms and actions.
- **`omkit check`** — typecheck the project (`tsc --noEmit`) and report diagnostics.
- **`omkit help`** — print the command overview (also `--help` / `-h`).

Both paths run the om in its own child process and narrate it to a run folder (see above). The picker **supervises** the child — piping its output into the live view and answering prompts for it — while `omkit run <om>` runs it **bare**, handing the om your terminal directly.

## Install

```sh
npm install omkit
```

Requires Node ≥ 20.11. ESM only.

## License

MIT
