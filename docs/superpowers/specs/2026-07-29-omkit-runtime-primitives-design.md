# omkit runtime primitives — design (Spec A)

**Date:** 2026-07-29
**Status:** approved, ready for planning
**Package:** `packages/omkit`
**Sibling:** Spec B — `2026-07-29-omkit-mcp-server-design.md`, which depends on this
and adds no further runtime primitives (it touches `core/` only for the `.mcp()`
marker and the `OMKIT_DISCOVER` guard).

## Why this is its own spec

These primitives were discovered while designing the MCP server, but none of them
requires MCP to exist. Each is independently useful to the CLI, the Ink app, anyone
reading a run folder by hand, and any future frontend. Splitting them keeps both
plans reviewable and lets this one land and be used before the server is finished.

## Scope

1. **The om builder** — `om(name).describe(…).args(…).run(body)`, **replacing**
   `om(name, body)`, which is removed.
2. **Declared args + resolution** — a schema on an om, filled from the environment,
   defaults, then prompting.
3. **`ctx.artifact`** — curating the files a run produces, beside `snapshot`.
4. **`kind: "multiline"`** — a prompt that accepts a block of text.

Out of scope: everything MCP. See Spec B.

## Decisions

| #   | Decision                                                   | Rationale                                                                                                                                                                            |
| --- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Builder chain on `om`, mirroring `action()`                | One shape across both primitives, and the only place to attach a schema without changing `om`'s call signature. (Spec B additionally relies on the chain being statically walkable.) |
| A2  | `om(name, body)` **removed**; the builder is the only form | One supported way to define an om. Migration is mechanical and hash-preserving — `siteFile` strips `:line`, so folders and history survive. Breaking change: minor bump on 0.x       |
| A3  | `.args(schema)` separate from Spec B's `.mcp({ mode })`    | Arg declaration drives prompting and later CLI flags; `mode` is meaningless without MCP                                                                                              |
| A4  | Args resolve _inside_ the run                              | Prompting is async; args must be readable synchronously at `.run()`. The run must exist for the prompt to be logged                                                                  |
| A5  | `ctx.artifact` is a runtime primitive                      | `snapshot` already labels JSON; files have no equivalent. Reaches the timeline, `artifacts.log`, and `result.json`                                                                   |
| A6  | `multiline` is a prompt kind, not an arg feature           | Any om may want a commit message or pasted payload; nothing about it is arg-specific                                                                                                 |
| A7  | Ink multiline editor deferred                              | The expensive part, and nothing is blocked by its absence — bare terminal and supervised callers both work                                                                           |

## 1. The om builder

```ts
om("seed-db")
  .describe({ summary: "Seed the dev database" })
  .args(z.object({ rows: z.number(), truncate: z.boolean().default(false) }))
  .run(async (ctx, args) => {
    // args: { rows: number; truncate: boolean }
  });
```

- `.describe({ summary })` — human-readable purpose. Surfaced by `omkit ls`, and by
  Spec B as a tool description.
- `.args(schema)` — a zod schema. Pins the body's second parameter to
  `z.infer<schema>`, threading types the way `.emits<E>()` / `.ref<H>()` already do
  on `action`.
- `.run(body)` returns `Promise<void>` and **launches immediately**, exactly as
  `om()` does today.

`action` gains `.describe()` and `.args()` with the same meaning. On an action,
`.args(schema)` pins the **first** parameter after `ctx`, so an action declaring
args takes a single object rather than positional parameters. An existing
multi-positional-arg action therefore cannot adopt `.args()` without that signature
change — a real migration cost, not something the builder papers over.

**`om(name, body)` is removed.** `om(name)` returns a builder, so passing a second
argument is a type error, and calling the old two-argument form throws with a
message pointing at `.run(body)`. There is no compatibility overload: one form,
one way to read an om file.

`.describe()` and `.args()` are both optional — `om("dev").run(body)` is the direct
replacement for `om("dev", body)` and is exactly as short.

### `.run` launches — deliberately

`om(name).args(…).run(body)` executes at module load, exactly as `om(name, body)`
did. This is not an oversight: `omkit run` and a plain `node om/oms/dev.ts` must
keep working. A `.run()` that only registered would require every om file to carry
an explicit launch step, and running one directly would silently do nothing.

The consequence is that **no om module can be loaded merely to read its metadata**.
Spec B needs exactly that, and solves it with an `OMKIT_DISCOVER` guard on `.run` —
**that guard is Spec B's change, not this spec's**, and appears in its file table,
not the one below. Nothing here depends on it. It is named only so the seam between
the two specs is explicit rather than discovered during implementation.

### Migration scope

Removal means **every live call site migrates in this project** — there is no
transition window in which both forms work. 25 files reference `om("…"`; the ~20
live ones are all in scope:

- `core/om.ts` — the builder replaces the two-argument function.
- `cli/commands/init.ts` — the scaffold, so new projects start on the only form.
- `packages/omkit/README.md` — required by `constraint-readme-sync.tskb.tsx`.
- `om/oms/tskb-dev.ts`, `om/oms/tskb-build.ts` — the two live oms.
- **~13 unit tests and 3 fixtures** under `packages/omkit/tests/`. Previously
  deferred on the grounds that they proved the old form still worked; with the old
  form gone, that rationale is void and they must migrate or fail to compile.

Out of scope: the four files under `docs/superpowers/` mentioning `om(`. They are
records of past decisions, not live documentation, and rewriting history to match a
later design would make them lies.

**This is a breaking change to a published package** (omkit is on npm at 0.4.8).
It warrants a minor bump under 0.x semantics, a README migration note, and a
CHANGELOG entry showing the before/after. The mechanical nature of the change —
`om(n, b)` → `om(n).run(b)` — makes it a one-line edit per call site, and run
folders are unaffected because the hash ignores line numbers.

## 2. Args and resolution

An om declares the shape of its inputs; omkit fills that shape in and hands the
finished object to the body.

Resolution order, stopping as soon as the shape is complete:

1. **Supplied** — `OMKIT_ARGS` on the environment, as JSON. (Spec B's server sets
   this; a manual run has nothing here.)
2. **Defaults** — from the schema.
3. **Prompt** — for whatever is still missing.
4. **Fail** — if nobody can be asked.

### Where it happens

Inside the run, not before it. Args must be readable synchronously at `.run()`, and
prompting is async — so `.run()` launches as normal and the root body resolves args
first, then invokes the user's body with the result. By then the run folder exists
and the log is open, so prompting is an ordinary in-run activity that lands on the
timeline with no special-casing.

Detailed sequence for `omkit run seed-db` with nothing supplied:

**Module load** (synchronous):

1. `om("seed-db")` returns a builder.
2. `.args(schema)` stores the schema.
3. `.run(body)` builds the `ExecutionTree` with `(name, callerSite())` and calls
   `tree.runRoot(wrapped)`.

**Inside `wrapped`** (async; run started, folder created, log open):

4. `raw = JSON.parse(process.env.OMKIT_ARGS ?? "{}")` → `{}`.
5. `schema.safeParse(raw)` fails: `truncate` took its default, `rows` is missing.
6. `error.issues` yields `{ path: ["rows"], code: "invalid_type", received:
"undefined" }` — this is how _missing_ is distinguished from _invalid_.
7. **Interactivity is checked once, before any prompting** — a supervisor is
   present, or `process.stdin.isTTY`. If neither, collect _every_ missing field
   from the issue list and throw a single error naming all of them. Never prompt
   for one field and then discover the second cannot be asked.
8. `rows` is promptable, so `await prompt({ message: "rows (number)" })`, coerce,
   and re-parse → `{ rows: 500, truncate: false }`.
9. Attach to the root node's args.
10. Invoke `body(ctx, resolved)`.

Steps 5–8 loop until the parse is clean or a pass makes no progress. The
interactivity check in step 7 happens on the first pass only.

Resolved args are attached to the root node, so `main.log`'s `#   args:` header
(NodeLogWriter.ts:44) records exactly what the run was given, including values typed
at a prompt.

An om with no `.args()` is unaffected: no schema, no resolution step, body takes
only `ctx`.

### Prompting a scalar

`string`, `number`, `boolean`, and enums map onto the prompt battery's existing
input and choice forms. Booleans and enums render as choices; the rest as input,
with the value coerced before re-parsing.

### Prompting a complex field

Objects and arrays are prompted as a block of JSON, using the `multiline` kind from
section 4:

```
config — JSON object
  { host: string, port?: number, tags?: string[] }
  paste JSON, or give a path to a .json file
> {"host":"db.local","port":5432}
```

- **The shape hint is rendered from JSON Schema.** Objects as `{ k: type }`, arrays
  as `type[]`, optionals with `?`, enums as `"a" | "b"`. Anything genuinely gnarly
  (deep unions, recursion) degrades to `see schema` with the raw JSON Schema printed
  below. The zod → JSON Schema conversion is shared with Spec B's `list_oms`.
- **A file path is accepted instead of inline JSON.** A bare path (`./config.json`)
  or sigil'd (`@config.json`); a bare path is unambiguous because JSON input starts
  with `{` or `[`. For a large config, pointing at a file beats pasting it whatever
  the input supports.
- **Invalid input re-asks with the reason**, rather than falling back to a default:

  ```
  ✗ config.port — expected number, received string
    { host: string, port?: number, tags?: string[] }
  >
  ```

  Capped at 3 attempts, then the run fails with the last validation error.

**Not built yet:** prompting field-by-field for nested scalars (`config.host`, then
`config.port`). Nicer for a shallow flat object, worse for arrays, unions, and
depth. Purely additive later, since the JSON path already covers every case.

### Guards

- **Non-interactive fails fast.** The prompt battery cannot hang — it carries a 30s
  default timeout that falls back to a default value (prompt.ts:101), and teardown
  unblocks a pending prompt. The risk is a _slow, confusing_ failure: 30s burned per
  missing field, then a validation error against an empty string. When no supervisor
  is present and stdin is not a TTY — CI, cron, a nested spawn — fail immediately
  with a message naming the missing args.
- **Required fields suppress empty-answer-means-default.** The battery treats an
  empty answer as the default; for a required arg with no default that silently
  yields `""`. Suppress it and re-ask.
- **Complex prompts get a longer timeout.** 30s is fine for typing a number, not for
  locating or composing JSON.

### Deferred

CLI flags (`omkit run seed-db --rows=500`) would slot in between steps 1 and 2 of
the resolution order, but `parseCli` currently rejects unknown options.

## 3. `ctx.artifact`

> Expected to iterate once real artifact piles exist. The shape below is a starting
> point, not a settled interface.

omkit has a producer for _named JSON_: `ctx.snapshot(name, value)` labels a value,
drops a timeline line, writes it into the run folder, and rolls up into
`snapshots.log`. Everything else — screenshots, dumps, generated reports — goes to
`ctx.artifactsFolder` as a bare filename with no name, description, or MIME hint.
Reading such a run means guessing from `shot-3.png`, `trace.json`, `out.txt` which
file is the point, whether you are a person or a program.

```ts
ctx.artifact("login-failure", shotPath, {
  description: "Screenshot at the point the assertion failed",
  // mime is optional — inferred from the extension when omitted
});
```

Registers a label, an optional description, and an optional MIME type (inferred
from the file extension when omitted) for a file the om wrote. Mirroring snapshots,
a registration:

- drops a timeline line, so it appears in `main.log` and the per-action log;
- rolls up into an `artifacts.log` facet beside `events` / `asserts` / `snapshots`;
- is serialized into `result.json`, so every consumer — the CLI, a future explorer
  view, Spec B's server — reads the same curated list.

Registration is additive: unregistered files remain in the folder and remain listed
by anything enumerating it. Curation raises signal; it does not gate access.

## 4. `kind: "multiline"`

The prompt battery has `input` and `choice`. Add a third for a block of text — a
commit message, a config blob, a pasted payload. Nothing about it is arg-specific;
args are simply its first consumer.

```ts
prompt({
  kind: "multiline",
  message: "config (JSON)",
  hint: "{ host: string, port?: number }",
  until: "json",
  timeoutMs: 120_000,
});
```

### `until` — deciding when input ends

| Value       | Behavior                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `"json"`    | Stop as soon as the accumulated text parses as JSON. Pasting a pretty-printed blob just works — no sentinel, no instructions |
| a string    | Sentinel line (e.g. `"."`), the classic convention. For free text with nothing to parse                                      |
| a predicate | Anything else                                                                                                                |

**Ctrl-D is deliberately not used.** Readline treats it as close, and `prompt` builds
and tears down an interface per call (prompt.ts:78-88), so it risks leaving stdin
unusable for later prompts in the same run.

### Per-transport cost

| Where                 | Work                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| `actions/prompt.ts`   | New kind; accumulate-until loop. Small                                                                        |
| `core/interaction.ts` | `PromptSpec` gains `"multiline"` and `hint`. Small — the supervisor still returns one string, so no streaming |
| `cli/ui/` (Ink)       | **Deferred.** `ink-text-input` is single-line; a real editor component is the expensive part                  |

**Deferring the Ink editor blocks nothing.** The bare terminal path works, and a
supervised caller returns a string by whatever means it likes. Until someone builds
it, the Ink app falls back to single-line input plus the file-path form.

## Files

### New

| File                               | Responsibility                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `output/artifact/ArtifactStore.ts` | Registry of curated artifacts, mirroring `SnapshotStore`                                                                                                                    |
| `core/args.ts`                     | Resolution: parse, diff against schema, prompt, coerce, re-parse                                                                                                            |
| `core/schema-json.ts`              | zod → JSON Schema. **Owned here, consumed by Spec B's `list_oms`** — Zod v4 has `z.toJSONSchema` natively, v3 needs `zod-to-json-schema`; pin against the installed version |
| `core/schema-hint.ts`              | JSON Schema → the human shape line shown in prompts                                                                                                                         |

### Changed

| File                                              | Change                                                                                   |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `core/om.ts`                                      | Builder form **replacing** `om(name, body)`; resolve args in the root body               |
| `core/action.ts`                                  | `Builder` gains `.describe()` / `.args()`                                                |
| `core/types.ts`                                   | Builder interfaces; `ActionContext` / `OmContext` gain `artifact`                        |
| `core/ExecutionTree.ts`                           | Wire the artifact registry; write `artifacts.log`; attach resolved args to the root node |
| `core/interaction.ts`                             | `PromptSpec` gains `"multiline"` and `hint`                                              |
| `actions/prompt.ts`                               | `kind: "multiline"`; `until`; suppressible empty-default                                 |
| `output/writers/views.ts`                         | `RunView` carries curated artifacts so they reach `result.json`                          |
| `cli/commands/init.ts`                            | Scaffold the builder form                                                                |
| `packages/omkit/README.md`                        | Required by `constraint-readme-sync.tskb.tsx`; add a migration note                      |
| `packages/omkit/package.json`                     | Minor version bump — removal is a breaking change                                        |
| `om/oms/tskb-dev.ts`, `om/oms/tskb-build.ts`      | Migrate to the builder                                                                   |
| `packages/omkit/tests/**` (~13 unit + 3 fixtures) | Migrate; the old form no longer compiles                                                 |

`zod` is a new dependency. It appears in `core/` (schema types, resolution) and in
user om files. It stays out of `output/`.

## Testing

Per `constraint-test-coverage.tskb.tsx`; unit tests colocated in
`packages/omkit/tests/unit/`.

- **Builder** — `.describe()` / `.args()` / `.run()` chain; `om("x").run(body)` with
  neither optional method works; the removed `om(name, body)` form throws a message
  pointing at `.run(body)`; **identical `omHash` before and after migrating a call
  site** (the test that proves removal costs nobody their run history).
- **Resolution** — `OMKIT_ARGS` beats defaults; missing scalars prompt when
  interactive; non-interactive with a missing required arg fails immediately rather
  than burning a 30s timeout per field; an om without `.args()` is untouched.
- **Complex args** — JSON accepted inline and by file path; invalid input re-asks
  and gives up after 3 attempts; the shape hint renders objects, arrays, optionals,
  and enums, and degrades on a gnarly schema.
- **`ctx.artifact`** — registration reaches the timeline, `artifacts.log`, and
  `result.json`; unregistered files are still listed.
- **`multiline`** — `until: "json"` terminates on a complete blob across several
  lines; a sentinel terminates on its own line; the timeout still fires.

## Risks

| Risk                                     | Mitigation                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Removal churns run folders               | It does not — `siteFile` strips `:line`, so the hash is unchanged. Covered by a test                                                      |
| Removal breaks published consumers       | Real, and accepted. Minor bump on 0.x, README migration note, CHANGELOG before/after. The edit is mechanical: `om(n, b)` → `om(n).run(b)` |
| Whole-repo migration lands in one change | ~20 live call sites, each a one-line edit; the compiler finds every one, so nothing can be silently missed                                |
| Non-interactive run stalls on prompts    | Cannot hang (30s timeout), but wastes 30s per field — detect non-TTY and unsupervised, fail immediately                                   |
| `ctx.artifact` shape proves wrong        | Additive, and unregistered files still list, so iterating breaks nothing already written                                                  |
| Multiline paste mis-terminates           | `until: "json"` is self-terminating for the main use; sentinel and predicate cover the rest                                               |
| zod as a new dependency                  | Confined to `core/` and user code; `output/` stays clean                                                                                  |
