# omkit

[![npm version](https://badge.fury.io/js/omkit.svg)](https://www.npmjs.com/package/omkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

**The operational-model kit.** _Humans orchestrate. Runs narrate. AI assistants follow along._

![An omkit run report: the timeline of a dev stack, with each action's call site, tags, events and the calls actions made on each other](https://raw.githubusercontent.com/mitk0936/tskb/main/references/omkit/report-timeline.png)

omkit is a small TypeScript runtime for the workflows **around** your code: start the API, wait until it actually answers, seed it, open the app in a real browser, check what a user would see, and tear it all down together. You write that orchestration as ordinary TypeScript (`await`, `if`, loops, variables). omkit runs each step as a supervised, typed **action** and writes down everything the run did: what launched, what came up, what each step handed the next, what failed, and what the world looked like at the time.

That record is the point. A human gets a report they can open from disk. An AI assistant gets files it can read and verify against, instead of guessing from interleaved terminal output. Where [tskb](https://www.npmjs.com/package/tskb) is the _knowledge_ layer (what your system **is**), omkit is the _operational_ one (what it's **doing right now**).

**What you get**

- **Orchestration as code.** Define an action once and launch it by calling it. No YAML, no DSL.
- **Typed handoffs between steps.** A step can publish a live value (a port, a client, a Playwright `Page`) and the next step receives it, typed. Nothing is scraped from stdout.
- **Gates that fail instead of hanging.** `.result`, `.ref` and `.once(event)` reject when the action fails or is cancelled.
- **Structured supervision.** A failure nobody is watching tears the whole run down, so a crashed dev server fails the run instead of leaving it wedged.
- **A durable run record.** Every run gets a folder with logs, a machine-readable tree, snapshots, artifacts and a self-contained HTML report.
- **Built for assistants.** An MCP server and a generated skill file let Claude (or any MCP client) discover, run and read your workflows.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Concepts](#concepts)
- [API reference](#api-reference): [`om`](#omname) · [`action`](#actionname) · [Activity](#activity) · [contexts](#contexts) · [`step`](#stepname-fn) · [errors](#errors)
- [Supervision and teardown](#supervision-and-teardown)
- [The run record](#the-run-record)
- [Batteries (`omkit/actions`)](#batteries-omkitactions)
- [Recipes](#recipes)
- [CLI](#cli)
- [MCP: let an assistant drive your oms](#mcp-let-an-assistant-drive-your-oms)
- [Skill file](#skill-file)
- [Migrating from `om(name, body)`](#migrating-from-omname-body)

## Install

```sh
npm install omkit
```

Requires Node ≥ 20.11. ESM only. Batteries that drive a browser use `playwright-core` and need a local Chrome or Chromium.

## Quick start

Scaffold a project, or add the files by hand:

```sh
npx omkit init   # tsconfig.omkit.json, oms/dev.ts, actions/hello.ts
```

An **om** is one runnable workflow. This one starts two dev servers, waits until the app really answers, then opens it in Chrome and hands the live page to the next step:

```ts
// oms/dev.ts
import { om } from "omkit";
import { command, healthcheck, browser, chromePage, drivePage } from "omkit/actions";

om("dev")
  .describe({ summary: "Start the API and web app, then check the home page." })
  .run(async ({ assert }) => {
    // Daemons: they keep running until the run is torn down.
    command("npm run dev", { cwd: "api" }).tag("api");
    command("npm run dev", { cwd: "web" }).tag("web");

    // A gate: resolves when the app answers, rejects if it never does.
    await healthcheck({ url: "http://localhost:3000" }).tag("web:ready").result;

    // A typed handoff: `.ref` is the live Browser, then the live Page.
    const chrome = browser({ headless: false });
    const page = chromePage("app", await chrome.ref, { url: "http://localhost:3000" });

    const home = await drivePage({ target: await page.ref, js: "document.title", screenshot: true })
      .result;
    assert(home.title.length > 0, "the home page has a title");

    console.log("stack is up, press Ctrl+C to stop");
  });
```

Run it:

```sh
npx omkit            # interactive picker: browse, run, watch milestones live
npx omkit run dev    # or run one om directly
```

Every run writes a folder such as `logs/dev-1a2b3c4d/2026-10-24/18-53-10/`, with `report.html`, `result.json`, `raw.jsonl` and one `.log` per action. See [The run record](#the-run-record).

## Concepts

| Term           | What it is                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| **om**         | One runnable workflow, `om(name).run(body)`. Its body is the root of a run.                               |
| **action**     | A named, typed unit of work, `action(name).run(exec)`. Defining it doesn't run it.                        |
| **Activity**   | What you get by **calling** an action: the live, running instance you observe and configure.              |
| **step**       | An inline, one-off action, `step(name, fn)`, with no reusable definition.                                 |
| **ref**        | A value an action publishes with `attach(...)` (a port, a client, a page). Others receive it from `.ref`. |
| **event**      | A typed signal an action emits (`healthy`, `ready`). Observe it with `.on` or wait for it with `.once`.   |
| **tag**        | A label on an activity (`api`, `web:ready`), shown in logs, the report and the skill file.                |
| **run folder** | The on-disk record of one run, keyed by the om's name and the file that defines it.                       |

Activities run in parallel. The om body stays in flight while you `await`, so the run never idles shut between steps.

## API reference

### `om(name)`

```ts
import { om } from "omkit";

om(name: string): OmBuilder
```

Returns a builder. Chain configuration, then finish with `.run(body)`, which launches the run.

| Method                   | Purpose                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `.describe({ summary })` | A one-line summary, shown by `omkit ls --describe`, the skill file, MCP and the report.                       |
| `.args(schema)`          | A zod schema for the run's inputs. **Resolved at runtime**; see below.                                        |
| `.mcp({ mode? })`        | Expose this om over MCP. `mode` is `"settling"` (default) or `"long-lived"`.                                  |
| `.run(body)`             | Launch the run. `body(ctx, args?)` receives an [`OmContext`](#contexts) and, after `.args()`, the typed args. |

`.run()` returns a promise that resolves once the run has torn down and written its record. It never rejects: failures are recorded in the run and set the process exit code. Whatever the body returns is recorded as the run's `value` in `result.json`.

The run's identity is its name plus the file that defines it. Logs land in `logs/<name>-<hash8>/…`, so same-named oms in different files never share a folder, and moving the call within its file doesn't change the hash.

#### Run arguments

```ts
import { z } from "zod";

om("seed")
  .args(z.object({ rows: z.number(), truncate: z.boolean().default(false) }))
  .run(async (ctx, { rows, truncate }) => {
    await command(`./seed.sh --rows ${rows}${truncate ? " --truncate" : ""}`).result;
  });
```

Each field is filled from the first source that can answer:

1. **Supplied:** `OMKIT_ARGS`, a JSON object in the environment. It is read once at run start and then cleared, so a subprocess doesn't inherit one om's args and resolve them against another's schema.
2. **Defaults:** anything the schema defaults is never asked about.
3. **Prompt:** whatever is still missing, one field at a time, with a one-line type sketch (`rows (number)`). Objects and arrays are asked for as a multiline JSON block; paste it, or answer with the path to a JSON file. A blank answer re-asks rather than coercing. Resolution gives up after three rounds.
4. **Fail:** if nobody can be asked (no supervising picker and no TTY), the run fails, naming every unresolved field.

Resolution happens inside the run, so prompts and answers land on the run's timeline, and the resolved values are recorded in `result.json` and the `main.log` header.

### `action(name)`

```ts
import { action } from "omkit";

action(name: string): ActionBuilder
```

| Method                   | Purpose                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `.describe({ summary })` | A one-line summary, carried onto every run of this action.                            |
| `.emits<Events>()`       | Declare the events this action emits, as a type: `{ ready: number; error: string }`.  |
| `.ref<Handle>()`         | Declare the type of the value this action publishes with `attach`.                    |
| `.args(schema)`          | Pin `.run`'s argument to a zod schema's type. **Type-level only** in code; see below. |
| `.mcp({ mode? })`        | Expose this action over MCP as a runnable tool.                                       |
| `.run(exec)`             | Bind the implementation. Returns an **Action**: a function you call to launch it.     |

`exec(ctx, ...args)` receives an [`ActionContext`](#contexts) and the arguments the action was called with. Its return value is the activity's result.

```ts
import { action } from "omkit";

export const server = action("server")
  .describe({ summary: "Serves the API and publishes its port." })
  .emits<{ listening: number }>()
  .ref<number>()
  .run(async ({ attach, emit, signal }, port: number) => {
    await listen(port); // start serving…
    emit("listening", port); // …announce it…
    attach(port); // …publish the port to whoever awaits `.ref`…
    await new Promise((r) => signal.addEventListener("abort", r)); // …and stay up until teardown
  });

const s = server(4000); // calling launches it and returns the live Activity
```

`.args(schema)` types the call site; launching an action in code neither validates nor prompts. The exception is an action run as an MCP tool: the JSON an assistant sends is parsed through the same schema, so `.default()`s are filled and bad values are refused before the body runs. Prompting for arguments is an om-level feature.

An Action also exposes `actionName`, `definedAt` (`file:line` of its `.run`), `description` and `mcp`, for tooling.

### Activity

Calling an action returns an `Activity<Result, Events, Handle>`:

| Member                | Type / behavior                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | The node's id in the run, e.g. `server_9f3c1a2b`.                                                                                                                     |
| `result`              | `Promise<Result>`. Resolves with the return value; **rejects** with the error on failure, or `CancelledError` on cancel.                                              |
| `ref`                 | `Promise<Handle>`. Resolves when the action calls `attach`; **rejects** on failure or cancel. Resolves `undefined` on success if nothing was attached.                |
| `once(event)`         | `Promise<payload>`. The next emit of `event`. If the activity settles first, resolves `undefined` on success and **rejects** on failure. `once("done")` is `.result`. |
| `on(event, handler)`  | Subscribe to every emit, including the system events `done`, `error` and `attached`.                                                                                  |
| `tag(name)`           | Add a label. Chainable.                                                                                                                                               |
| `withCache(...paths)` | Skip the body when these input paths are unchanged since the last success (the result is then `undefined`). Chain it before the first `await` after launching.        |
| `cancel()`            | Abort this activity and everything it launched.                                                                                                                       |

The body starts one microtask after the call, so `.tag(...)` and `.withCache(...)` chained in the same expression apply before it runs.

**Events replay their latest value.** An event's most recent payload (like `healthy`) is replayed to a listener that subscribes late, so `await probe.once("healthy")` works even after the probe passed.

**About `.ref`.** The value `.ref` resolves to is a thin, shallow wrapper over what the action attached:

- Every reader gets the same wrapper.
- Methods run bound to the real object, so private fields keep working.
- Each public method call that another action makes on it is recorded in the run: who called, from which line, and how long it took.
- Return values are not wrapped, and recording stops after 500 calls per handle.

The wrapper is not `===` to the original object, so code that compares it against a reference obtained some other way will see two different objects.

### Contexts

The action `exec` receives an `ActionContext`; the om body receives an `OmContext`.

| Member                        | `ActionContext` | `OmContext` | Purpose                                                                                                                                                          |
| ----------------------------- | :-------------: | :---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signal`                      |        ✓        |      ✓      | `AbortSignal` that fires on cancel or teardown. Honor it to stop early.                                                                                          |
| `logs`                        |        ✓        |      ✓      | The run's combined log, read-only: `logs.subscribe({ replay? })` is an async iterable of entries.                                                                |
| `tag(name)`                   |        ✓        |      ✓      | Tag this node.                                                                                                                                                   |
| `assert(cond, message)`       |        ✓        |      ✓      | Record a pass or fail in the run's verdict. Never throws.                                                                                                        |
| `snapshot(name, value)`       |        ✓        |      ✓      | Write `value` as JSON into the run folder; resolves the file's path.                                                                                             |
| `artifact(name, file, opts?)` |        ✓        |      ✓      | Label a file you wrote (optional `description`, MIME inferred). It appears in `result.json` and the report.                                                      |
| `artifactsFolder`             |        ✓        |      ✓      | Absolute path of the run's output folder. Write artifacts here.                                                                                                  |
| `emit(event, payload)`        |        ✓        |             | Emit one of the action's declared events.                                                                                                                        |
| `attach(handle)`              |        ✓        |             | Publish the action's handle and resolve its `.ref`. The first call wins.                                                                                         |
| `proc(name, opts?)`           |        ✓        |             | Spawn a child process: ``proc("tsc")`tsc -b` `` ([zx](https://github.com/google/zx) syntax). Its output goes to this action's log, and it is killed on teardown. |
| `cancel()`                    |                 |      ✓      | Tear the whole run down.                                                                                                                                         |

`console.*` inside an action or the om body is captured and attributed to that node's log.

### `step(name, fn)`

```ts
import { step } from "omkit";

const rows = await step("seed catalog", async (ctx) => db.seed(40));
```

Runs `fn(ctx)` as its own node, with its own log, tags and error boundary, without a reusable definition. It returns a promise of `fn`'s result that rejects on failure or cancel, and its source location is where you wrote it.

### Errors

```ts
import { CancelledError, isCancelled } from "omkit";
```

A cancelled activity rejects `.result`, `.ref` and `.once` with `CancelledError`. `isCancelled(err)` tells an intentional stop apart from a real fault.

## Supervision and teardown

A failure that **nobody is watching** tears the whole run down and marks it failed. An activity is "watched" if, before it fails, you awaited its `.result`, `.ref` or `.once`, attached `.result.catch(...)`, or added an `on("error")` listener.

```ts
// Awaited: a failure throws here. Catch it to branch; the run stays green.
try {
  await command("npm test").result;
} catch {
  return;
}

// Fire-and-forget: if the dev server crashes, the run tears down. That's the guardrail.
command("npm run dev", { cwd: "web" }).tag("web");

// Owned: note the failure and carry on. (`fn` also runs on cancel; check `isCancelled`.)
flakyJob().result.catch((err) => console.warn("job failed, carrying on", err));
```

- **Success keeps the stack alive.** When the om body returns, the daemons it started keep running until Ctrl+C or `ctx.cancel()`.
- **Teardown is graceful.** Ctrl+C or `cancel()` aborts every signal, kills processes, unblocks waits, and always writes the run record. Nodes get a 5-second grace period to settle.
- **Write abort-aware daemons.** A daemon should stop when `signal` fires. Check `signal.aborted` before adding the listener, or a cancel that lands earlier is missed.

## The run record

Every run writes a folder under the project that owns the config: `logs/<name>-<hash8>/<date>/<time>/`.

| File                                                          | Contents                                                                                                                                                                  |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.html`                                                 | The whole run as one self-contained page; see below.                                                                                                                      |
| `result.json`                                                 | The run tree: each node's status, timing, args, tags, returned `value`, `calledAt` and `definedAt` sites, its `.describe()`/`.mcp()`/`.args()` metadata, and the verdict. |
| `raw.jsonl`                                                   | Every log entry, machine-readable, in order.                                                                                                                              |
| `main.log`, `<action>_<id>.log`                               | Human-readable timelines, one per node.                                                                                                                                   |
| `events.log`, `asserts.log`, `snapshots.log`, `artifacts.log` | Cross-cutting rollups.                                                                                                                                                    |
| `snapshots/`                                                  | The JSON written by `snapshot(...)`.                                                                                                                                      |

Because the folder is keyed by the om's name and its defining file, a script or an assistant can always find "the latest `dev` run", diff two runs of the same workflow, and answer questions with evidence: _did the server pass its healthcheck? which process died first? what config did the build run with?_

### `report.html`

The report needs no server: the data, images and viewer are all inlined, so it opens straight from disk and survives being zipped or attached.

- **Timeline:** every action as a bar. Each row shows how your code called it (`shop = api(…)`), its tags, status and duration, and points for its events, snapshots, assertions and errors.
- **Links between actions:** who waited on whose event (`once`), who cancelled whom, and the method calls made on another action's `.ref`. These show as points on the caller's row, with a dashed line to the target.
- **Flow:** the run as a graph of lanes. Snapshots and links ride along as chips.
- **Details:** for the selected action, its summary, tags and call site, plus sections for errors, args, the returned value, snapshots, events, links, logs and assertions.
- **Source:** the `<>` button next to an action opens its call site, its definition, its args and its returned value, editor-style.
- **Errors:** every failure, failed assertion and block of error output, with a switch that highlights where they came from.

![The flow view of the same run: actions as cards in lanes, with snapshot and link chips](https://raw.githubusercontent.com/mitk0936/tskb/main/references/omkit/report-flow.png)

![The source popup on an action, on its Args tab](https://raw.githubusercontent.com/mitk0936/tskb/main/references/omkit/report-popup.png)

## Batteries (`omkit/actions`)

Ready-made actions built on the same engine. For anything else, write your own with `action(...)`.

| Battery                                                                           | Does                                                                                                                                           | Events                                           | `.ref` / result                              |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- |
| `command(cmd, { args?, cwd?, env? })`                                             | Runs a shell command, or an executable when `args` is given, as an action named after it. Output goes to its log; killed on teardown.          | —                                                | Rejects on a non-zero exit.                  |
| `healthcheck({ url \| host+port+path, status?, body?, intervalMs?, timeoutMs? })` | Polls until the endpoint answers with a matching status (and body).                                                                            | `healthy`                                        | Result `{ url, status, attempts }`.          |
| `portFree(port, { host?, intervalMs?, timeoutMs? })`                              | Polls until nothing listens on the port, so a restart can rebind.                                                                              | `free`                                           | Result `{ port, host, attempts }`.           |
| `untilLog(matcher, { timeoutMs?, replay? })`                                      | Waits for the first run-log entry matching `matcher(entry)`.                                                                                   | `match`                                          | The matching entry.                          |
| `tailLog(file, { fromStart?, encoding? })`                                        | Tails a file another process writes and folds its lines into the run log.                                                                      | —                                                | —                                            |
| `watch(file, { onCreate?, onUpdate?, onDelete?, onMissing? })`                    | Watches one file and survives it being deleted and recreated.                                                                                  | —                                                | —                                            |
| `watchDir(dir, { debounceMs? })`                                                  | Watches a directory tree and survives it being wiped and recreated.                                                                            | `ready`, `create`, `update`, `delete`, `removed` | —                                            |
| `prompt({ kind?, message, choices?, default?, timeoutMs?, until? })`              | Asks in the terminal (or the picker, or the MCP client). `kind` is `"input"`, `"choice"` or `"multiline"`. Falls back to `default` on timeout. | —                                                | Result: the answer.                          |
| `browser({ headless?, channel?, executablePath?, args? })`                        | Launches Chromium with Playwright (defaults to the installed Chrome); closed on teardown.                                                      | —                                                | `.ref`: the live `Browser`.                  |
| `chromePage(label, source, { url?, match? })`                                     | Opens or attaches to a page. `source` is a CDP address, a `Browser`, a `BrowserContext` or a `Page` (an Electron window works too).            | `navigated`, `console`, `pageerror`              | `.ref`: the live `Page`.                     |
| `drivePage({ target \| match \| url, js, screenshot? })`                          | Evaluates `js` in a page and optionally saves a screenshot as an artifact.                                                                     | —                                                | Result `{ value, title, url, screenshot? }`. |

## Recipes

**Skip work that's already done.** `withCache` fingerprints the inputs and skips the body when nothing changed since the last success:

```ts
const build = action("build").run(({ proc }) => proc("tsc")`tsc -b`);

om("build").run(async () => {
  const out = await build().withCache(`${process.cwd()}/src`).result;
  if (out === undefined) console.log("no changes, skipped the build");
});
```

**Gate on an event.** `once` resolves when the event fires and rejects if the action fails first, so a gate never hangs:

```ts
const db = database().tag("db");
await db.once("ready");
await seed(db.ref).result;
```

**Watch and react.**

```ts
import { watchDir } from "omkit/actions";

om("watch").run(() => {
  watchDir("src").on("update", (file) => console.log(`changed: ${file}`));
  // the body returns; the watcher keeps the run alive until Ctrl+C
});
```

**Gate a deploy on green tests.**

```ts
om("ship").run(async () => {
  try {
    await command("npm test").result;
  } catch {
    return; // red: stop here; the run stays green because the failure was observed
  }
  await command("./deploy.sh").result;
});
```

**Keep a human in the loop.** `prompt` falls back to its default when nobody answers, so it never blocks CI or an agent-driven run:

```ts
import { prompt } from "omkit/actions";

om("deploy").run(async () => {
  const answer = await prompt({
    kind: "choice",
    message: "Deploy to production?",
    choices: ["no", "yes"],
    default: "no",
    timeoutMs: 10_000,
  }).result;
  if (answer === "yes") await command("./deploy.sh").result;
});
```

**Take a block of text.** `kind: "multiline"` reads until `until` says stop: parseable JSON (the default), a sentinel line, or a predicate:

```ts
const blob = await prompt({
  kind: "multiline",
  message: "Paste the service config",
  hint: "{ host: string; port: number }",
  until: "json", // or "." to end on that line, or (text) => text.length > 500
}).result;
```

## CLI

The `omkit` bin works on a project described by a `tsconfig.omkit.json` that includes your `oms/` and `actions/`. Pass `--tsconfig <path>` to use another config.

| Command               | What it does                                                                                                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `omkit` / `omkit run` | Interactive picker: search oms by name or summary, see the highlighted one's summary, file and the actions it calls, then run it, watch its milestones live, and answer prompts in place. |
| `omkit run <om>`      | Run one om by name or file path, with your terminal attached.                                                                                                                             |
| `omkit ls`            | List the discovered oms and actions (a static scan; it never imports your code). `--describe` adds summaries and MCP exposure.                                                            |
| `omkit check`         | Typecheck the project (`tsc --noEmit`).                                                                                                                                                   |
| `omkit init`          | Scaffold `tsconfig.omkit.json`, `oms/dev.ts` and `actions/hello.ts`. Never overwrites existing files.                                                                                     |
| `omkit skill`         | Generate `.claude/skills/omkit-runs/SKILL.md`; see [Skill file](#skill-file). `--check` fails when it is out of date.                                                                     |
| `omkit mcp`           | Serve the project over MCP on stdio.                                                                                                                                                      |
| `omkit help`          | Print the command overview (also `--help` / `-h`).                                                                                                                                        |

Both run paths start the om in its own child process. The picker **supervises** it, piping its output into the live view and answering its prompts. `omkit run <om>` runs it **bare**, handing it your terminal.

Discovery and `omkit check` type-check the project and keep TypeScript's incremental state in `node_modules/.cache/omkit/`, so a file that hasn't changed isn't checked again on the next start. Set `OMKIT_CACHE_DIR` to keep it elsewhere, or `OMKIT_NO_CACHE=1` to turn it off.

## MCP: let an assistant drive your oms

`omkit mcp` serves a project over the [Model Context Protocol](https://modelcontextprotocol.io). Claude and other clients can discover your oms, run one, and read what the run produced.

**Nothing is exposed unless you say so.** Add `.mcp()` to an om or action; without it the server neither lists nor runs it.

```ts
om("smoke-test")
  .describe({ summary: "Boot the app and run the smoke suite" })
  .args(z.object({ headless: z.boolean().default(true) }))
  .mcp() // now an assistant can run it
  .run(async (ctx, { headless }) => {
    /* … */
  });
```

`mode` defaults to `"settling"`, for a run that finishes on its own. Declare `.mcp({ mode: "long-lived" })` for a server or a watcher; `run_om` refuses those and points to `start_om`.

Point your client at the project:

```json
{
  "mcpServers": {
    "omkit": { "command": "npx", "args": ["--no", "--", "omkit", "mcp"] }
  }
}
```

If the project sits in a subfolder, name its config: `["--no", "--", "omkit", "mcp", "--tsconfig", "om/tsconfig.omkit.json"]`. The server takes its project root from that config and resolves `logs/` under it, so runs started from the terminal and runs started by an assistant land in the same tree.

| Tool                    | What it does                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| `list_oms`              | Exposed oms and actions: summary, mode, and the JSON Schema of their arguments. |
| `run_om(name, args)`    | Run a settling entry to completion; returns its verdict and assertion tally.    |
| `start_om(name, args)`  | Start anything and return a handle immediately.                                 |
| `get_run(run)`          | Status, verdict once settled, and links to the files the run produced.          |
| `tail_run(run, cursor)` | Log lines since `cursor`: live while running, from `raw.jsonl` once settled.    |
| `cancel_run(runId)`     | Tear a run down; it still writes its run folder.                                |

The tool list stays at six however many oms you have, so call `list_oms` first to get each entry's argument schema.

- **Run folders are resources.** `omkit://runs/{run}/latest/{file}` reads from an om's newest run, and `omkit://runs/{run}/{date}/{time}/{file}` from a specific one. Reads are confined to the project's `logs/`, size-capped and read-only.
- **While a run is going,** milestones arrive as progress notifications, cancelling the request tears the run down, and a `prompt` raised mid-run reaches the client as an elicitation.

To exercise the tools by hand, use the [MCP Inspector](https://github.com/modelcontextprotocol/inspector): `npx -y @modelcontextprotocol/inspector npx --no -- omkit mcp`. On Windows, if it can't spawn the `npx` shim, point it at `node node_modules/omkit/dist/cli/index.js mcp`. Closing the Inspector tears down anything it started.

## Skill file

`list_oms` answers "what can I run here?" at runtime, at the cost of a round trip. `omkit skill` writes the same answer to a file an assistant already has in context:

```sh
omkit skill          # writes .claude/skills/omkit-runs/SKILL.md
omkit skill --check  # exits non-zero when it no longer matches the project
```

Each exposed workflow gets its summary, argument shape, source path and an outline of what it calls, read statically with the `.tag(...)` names you wrote:

```
### `tskb:build` — settling

Rebuild the tskb knowledge graph from this repo's .tskb.tsx docs.

- **Defined in:** `om/oms/tskb-build.ts`
- **Args:** `{ verbose?: boolean, projectName?: string }`
- **Calls:** `watchDir` [watch:build:daemon] → `buildDocs` [build]
```

Generating it runs nothing. Commit it, and put `--check` in a pre-commit hook or CI. Its `registry-hash` covers your declarations rather than the rendered markdown, so reformatting doesn't trip the check. The one field to edit by hand is the frontmatter `description`, which decides when an assistant loads the file; regeneration keeps it.

## Migrating from `om(name, body)`

`om(name, body)` was removed in 0.5.0. `om(name)` now returns a builder, and `.run(body)` takes the second argument:

```diff
-om("dev", async (ctx) => {
+om("dev").run(async (ctx) => {
   // ...
 });
```

Run folders are unaffected: a run's identity is its name plus its defining file, and line numbers are not part of the hash.

## License

MIT
