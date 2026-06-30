# tswm

A companion to [tskb](https://www.npmjs.com/package/tskb) for building
simulations. Where tskb is the _knowledge_ layer, `tswm` is the _operational_
layer: a small engine for orchestrating typed **actions** under a single
**run**, sharing one append-only **log**.

## Concepts

- **Action** — a named, typed unit of work. Declare optional events and an
  imperative handle, then provide the implementation:

  ```ts
  import { action } from "tswm";

  const build = action("Build").run(async ({ proc }) => {
    await proc("tsc", { cwd: "." })`tsc -b`;
  });
  ```

- **Run** — launches actions in parallel under one abort controller and the
  process-wide log. One run per process. Add actions on demand, observe the
  verdict, stream the log:

  ```ts
  import { run } from "tswm";

  const r = run(build()).drain();
  const { ok, failures } = await r.done;
  ```

- **proc** — spawn child processes (via [zx](https://github.com/google/zx))
  bound to an action: their output streams into the log and they're killed on
  teardown.

## Entry points

- `tswm` — the core engine: `action`, `run`, `snapshot`, `events`,
  `createProc`, `LogsCollector`, `log`, and the supporting types.
- `tswm/actions` — reusable actions built on the engine:
  - `command` — wrap a fixed shell command in an action.
  - `watch` — watch a single file (which may not exist yet) for transitions.
  - `watchDir` — watch a directory, surviving wipe + recreate, emitting
    per-file events.
  - `untilLog` — a gate that resolves on the first log entry matching a
    predicate.

```ts
import { run } from "tswm";
import { command, watchDir } from "tswm/actions";
```

## License

MIT
