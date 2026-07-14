# omkit

**The operational-model kit.** _Typed actions. One run. One log._

A tiny runtime for the workflows _around_ your code — build, watch, spawn, probe, drive a browser, read state back, and tear it all down together. Where [tskb](https://www.npmjs.com/package/tskb) is the _knowledge_ layer, `omkit` is the _operational_ one: the running, typed model of your system in motion.

## The problem

Real developer workflows aren't linear. They start processes, wait for health checks, connect a browser, read state back, watch files, react to events — and shut everything down as one. Most teams glue this together with shell scripts, npm scripts, and ad-hoc Node, and get back a pile of opaque process output.

`omkit` models the workflow instead. Each step is a typed **action** running inside one runtime. Actions don't share globals — they hand each other typed runtime **capabilities** (a port, a client, a live browser page) and emit typed **events**, all onto one log. So a running system exposes structured handoffs and observations, which makes it observable, reproducible, and scriptable.

```ts
import { om } from "omkit";
import { command, healthcheck, chromePage } from "omkit/actions";

om(async () => {
  command("api", "npm run dev:api").exec().tag("api:daemon"); // start a daemon…

  const ready = await healthcheck({ port: 3000 }).exec().result; // …gate on it…
  if (!ready.ok) return;

  // …then hand the live page downstream — typed, not scraped from a log.
  const page = chromePage("app", "localhost:9222", { url: "http://localhost:3000" }).exec();
  await inspect(page.ref); // whatever drives the app receives the live Page

  console.log("up — press Ctrl+C to stop");
});
```

`page.ref` isn't a URL scraped from stdout — it's a typed capability the next step receives and drives. Few workflow tools pass anything but strings between steps.

```
                      om()
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
     command       healthcheck    chromePage
    (daemon)         (gate)          │ .ref
                                     ▼
                                 your driver
```

## Core concepts

### Actions & Activities

An **Action** is an immutable description of work — named, typed, optionally declaring events and an imperative handle. An **Activity** is a live execution of one, created synchronously by `.exec()`. Everything _before_ `exec()` configures the Action; everything _after_ configures or observes the Activity.

```ts
import { action } from "omkit";

const Build = action("Build").run(({ proc }) => proc("tsc")`tsc -b`);

const activity = Build().exec(); // launch; returns the live Activity
```

`om(async (ctx) => …)` hosts a linear orchestration as the root of a run. You write normal `await` / `if` / loops / variables; the Activities you launch keep running in parallel. Because the body stays in-flight while you `await`, the run never idles shut between steps. For a one-off inline step, `step(name, fn)` runs `fn` as its own node without a reusable definition.

### Typed capabilities

An action can `attach` a value — a port, a client, a page — that downstream actions receive by awaiting `activity.ref`. Not a file descriptor: a typed runtime handoff, so actions chain without globals or string-scraping.

```ts
const Server = action("Server")
  .ref<number>()
  .run(async ({ attach, signal }) => {
    attach(await listen()); // publish the capability…
    await until(signal); // …and stay alive until teardown
  });

const Probe = action("Probe").run((_ctx, port: Promise<number>) => drive(port));

om(async () => {
  const server = Server().exec();
  Probe(server.ref).exec(); // Probe receives Server's port, typed
});
```

### Outcomes — a result that doesn't throw

Every Activity settles to a typed **`Outcome`**, read via `activity.result` — which **never throws**:

```ts
type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

const r = await runTests().exec().result;
if (!r.ok) {
  // an expected, operational failure — inspect it and carry on
}
```

Awaiting `.result` also _observes_ the Activity (see teardown, below). A cancelled Activity resolves `{ ok: false, error: CancelledError }`.

### Failure & teardown

omkit uses **structured supervision**: a failure that **nobody is watching** tears the whole run down and marks it failed. An Activity is "watched" if — before it fails — you awaited its `.result` (or `.ref`), attached an `on("error")` listener, or attached `.handleFailure`.

- **Await it** (`await x.exec().result`) → the failure is yours to inspect as `{ ok: false }`; the run stays green.
- **Fire-and-forget it** (`x.exec()`, never awaited) → an unobserved failure tears the run down. This is the guardrail for daemons: a crashed daemon fails the run instead of leaving it wedged.
- **`.handleFailure(fn)`** → own a fire-and-forget Activity's failure: `fn(error)` runs instead of tearing down.

```ts
watchDir(".build").exec().tag("watch:daemon"); // crash here → run tears down
someFlakyDaemon()
  .exec()
  .handleFailure((e) => log(e)); // …unless you own it
```

**Ctrl+C** and **`ctx.cancel()`** tear everything down gracefully — the log is always written. And **success is keep-alive**: when your `om` body returns, daemons it launched keep running until Ctrl+C or `cancel()`, so a body that finishes wiring things up doesn't kill the servers it started.

### One log, on disk

Every action's output, events, asserts, snapshots, and lifecycle land on **one timeline**. It streams live to the terminal (curated milestones) and is written to a per-run folder:

- `result.json` — the run's tree, per-node status, and verdict.
- `raw.jsonl` — every entry, machine-readable.
- `main.log` + one `.log` per node — the human-readable timelines.
- `events.log` / `asserts.log` / `snapshots.log` — cross-cutting rollups.

`ctx` also gives each action `assert(...)` (tallies into the verdict) and `snapshot(name, value)` (captures JSON state to the run folder) — so a run is an inspectable artifact, not just exit codes.

## Events

An Activity exposes its declared events plus the lifecycle ones (`done`, `error`, `attached`):

- **`activity.on(event, handler)`** — subscribe to every emit.
- **`activity.once(event)`** — a **promise** for the next emit; resolves `undefined` if the Activity settles first, so an `await` never hangs. A retained snapshot (like `healthy`) is replayed immediately even if you subscribe late.

```ts
const probe = healthcheck({ port: 3000 }).exec();
probe.on("healthy", (r) => console.log(`up after ${r.attempts} tries`));
```

## Batteries — `omkit/actions`

Reusable actions built on the core engine. For anything beyond these, drop down to `action(...).run(...)`.

- **`command`** — run a shell command; output streams to the log, killed on teardown.
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
