# Changelog

## 0.5.0

### Breaking

- **`om(name, body)` removed.** Use `om(name).run(body)`. Run folders are unchanged:
  identity is the om's name plus its defining file, and line numbers are excluded from
  the hash, so migrating a call site preserves its history. A two-argument call now
  throws and names the replacement rather than silently dropping the body.

### Added

- `om(name).describe({ summary })` and `action(name).describe({ summary })` — the summary
  survives every builder link and is stored where it can be read back: on the `Action` an
  action's `.run(...)` returns, and on the run an om's `.run(...)` starts. Nothing in the
  runtime reads it yet — `omkit ls` does not show it.
- `action(name).args(schema)` pins the type of `.run`'s args parameter (the action's first
  argument) to a zod schema's inferred type. Type-level only: the schema is not validated
  at runtime, because an action launched from an om body is passed its arguments in code.
- `om(name).args(schema)` declares the run's inputs and resolves them at run start, passing
  the typed result to `.run`'s body as its second parameter. Each field is filled from what
  was supplied (`OMKIT_ARGS`, a JSON object, read once at run start and then cleared from the
  environment so subprocesses do not inherit it), then the schema's defaults, then by prompting
  — and if nobody can be asked, the run fails naming every unresolved field at once rather
  than blocking on a question no one will see. A blank answer re-asks instead of coercing;
  an object or array field can be answered with a pasted JSON blob or the path to a JSON file.
  The resolved values are recorded on the root node, so `result.json` and the `main.log`
  header report what the run was actually given.
- `ctx.artifact(name, file, opts?)` labels a file the run produced. Registrations reach
  the timeline and `artifacts.log` (every call, chronologically) and `result.json`, which
  carries the latest registration per `(node, name)` — so one node re-labelling a name
  updates in place, while two nodes choosing the same name both survive.
- `prompt({ kind: "multiline" })` reads a block of text, terminated by parseable JSON,
  a sentinel line, or a predicate.

_Releases before 0.5.0 predate this file._
