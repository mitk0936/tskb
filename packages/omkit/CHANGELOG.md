# Changelog

## 0.5.0

### Breaking

- **`om(name, body)` removed.** Use `om(name).run(body)`. Run folders are unchanged:
  identity is the om's name plus its defining file, and line numbers are excluded from
  the hash, so migrating a call site preserves its history. A two-argument call now
  throws and names the replacement rather than silently dropping the body.

### Added

- `om(name).describe({ summary })` and `action(name).describe({ summary })` — the summary
  is accepted and carried on the definition; nothing in the runtime reads it yet.
- `action(name).args(schema)` pins the type of `.run`'s args parameter (the action's first
  argument) to a zod schema's inferred type. Type-level only: the schema is not validated
  at runtime, because an action launched from an om body is passed its arguments in code.
- `ctx.artifact(name, file, opts?)` labels a file the run produced. Registrations reach
  the timeline and `artifacts.log` (every call, chronologically) and `result.json`, which
  carries the latest registration per `(node, name)` — so one node re-labelling a name
  updates in place, while two nodes choosing the same name both survive.
- `prompt({ kind: "multiline" })` reads a block of text, terminated by parseable JSON,
  a sentinel line, or a predicate.

_Releases before 0.5.0 predate this file._
