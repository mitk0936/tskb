# omkit

**The operational-model kit.** _Typed actions. One run. One log._

A runtime for the workflows around your code — build, watch, spawn, probe, drive
a browser, inspect state, tear it all down together. `omkit` is the running,
typed model of your system in motion. Where
[tskb](https://www.npmjs.com/package/tskb) is the _knowledge_ layer, `omkit` is
the _operational_ one.

## The problem

Real developer workflows aren't linear. They start processes, wait for health
checks, connect a browser, read state back, watch files, react to events — and
shut everything down as one. Most teams glue this together with shell scripts,
npm scripts, and ad-hoc Node.

`omkit` models the workflow instead. Each step is a typed **action** running
inside one runtime, and actions don't share globals — they hand each other typed
runtime **capabilities** (a port, a client, a live browser page) and emit typed
**events**. So a running system exposes structured handoffs and observations
rather than a pile of opaque process output — which makes the whole thing
observable, reproducible, and scriptable.

```ts
import { spin } from "omkit";
import { command, healthcheck, chromedriver, chromePage } from "omkit/actions";

spin(async ({ nod }) => {
  nod(command("api", "npm run dev:api")); // start a daemon…
  await nod(healthcheck({ port: 3000 })).once("healthy"); // …gate on it…

  const chrome = nod(chromedriver({ url: "http://localhost:3000" }));
  nod(chromePage(chrome.ref)); // …then hand the live page downstream
});
```

That last line is the point. `chrome.ref` isn't a URL scraped from a log — it's a
typed capability the next action receives and drives. Few workflow tools pass
anything but strings between steps.

```
                    spin()
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
     command      healthcheck   chromedriver
                                     │ .ref
                                     ▼
                                 chromePage
                                     │ .ref
                                     ▼
                                inspectPage
```

## Five concepts

- **Action** — a named, typed unit of work; optionally declares events and an
  imperative handle. Calling it constructs an instance (deferred — the run
  executes it).

  ```ts
  const build = action("Build").run(({ proc }) => proc("tsc")`tsc -b`);
  ```

- **Spin** — hosts an async orchestration _inside_ the runtime. You write normal
  `await` / `if` / loops / variables, while the actions you launch keep running
  in parallel. omkit runs your function as one in-flight action and hands it
  `nod`; because that host stays in-flight while you `await`, the run never idles
  shut between steps. `nod(instance)` launches an action and returns it, so you
  can `await` its `.once(...)` or its `.ref`:

  ```ts
  spin({ failFast: false }, async ({ nod }) => {
    if ((await nod(prompt({ … })).once("done")) === "yes") await nod(test).once("done");
    nod(devServer); // daemon: keeps the run alive
    const chrome = nod(chromedriver({ … }));
    nod(chromePage(chrome.ref));
  });
  ```

- **Handle — a typed capability** — an action can `attach` a value (a port, a
  client, a page) that others `await` via `instance.ref`. Not a file descriptor:
  a typed runtime handoff, so actions chain without globals or string-scraping:

  ```ts
  const Server = action("Server")
    .ref<number>()
    .run(async ({ attach, signal }) => {
      attach(await listen()); // publish the capability…
      await until(signal); // …and stay alive
    });

  const Probe = action("Probe").run((_ctx, port: Promise<number>) => drive(port));

  spin(async ({ nod }) => {
    const server = nod(Server());
    nod(Probe(server.ref)); // Probe receives Server's port, typed
  });
  ```

- **Log** — every action's output, events, and lifecycle land on one timeline. It
  streams live and is written to disk. (A spin auto-drains; pass `drain: false`
  to start the stream yourself — e.g. after a `prompt` so it doesn't write over
  the question.)

- **Run** — the runtime a spin sits on: actions in parallel under one abort
  controller and the process-wide log, one run per process. `spin` is the usual
  entry point; drop to `run(...)` directly when you just want to launch a fixed
  set and `await r.done`. Ctrl-C, a failure, or natural completion tears it all
  down.

## Events

An instance exposes its declared events plus the lifecycle ones (`done`,
`error`, `attached`):

- **`instance.on(event, handler)`** — subscribe with a handler for every emit.
- **`instance.once(event)`** — a **promise** for the next emit: resolves with the
  payload, or rejects if the action settles first (so an `await` never hangs).
  `await instance.once("done")` is the action's result; a retained snapshot (like
  `healthy`) resolves immediately even if you subscribe late.

## Batteries — `omkit/actions`

- **`command`** — wrap a shell command (output streams to the log, killed on teardown).
- **`watch`** / **`watchDir`** — watch a file or directory for changes (survives wipe + recreate).
- **`untilLog`** — gate on the first log entry matching a predicate.
- **`tailLog`** — tail a file another process writes, streaming its lines into the combined log.
- **`healthcheck`** — poll a URL/port until status (and optionally body) matches.
- **`prompt`** — ask the terminal for input or a choice, with a timeout that falls back to a default; the answer is its handle.
- **`chromePage`** — attach to Chrome over CDP — or to an existing Playwright
  `Page`/`Browser`/`Context` (including Electron windows) — and expose the live
  `Page` as a handle.

## Install

```sh
npm install omkit
```

## License

MIT
