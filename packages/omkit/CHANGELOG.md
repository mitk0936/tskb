# Changelog

## 0.7.0

### Added

- **`omkit skill` — generate the map an assistant reads before its first call.** Writes
  `.claude/skills/omkit-runs/SKILL.md` from what a project's oms and actions declare: what each
  one does, the arguments it takes, and how to invoke it — both the shell form, which always
  works, and the MCP form when the server is wired up. The MCP server answers the same questions
  at runtime, but charges a round trip for it: an assistant has to call `list_oms` before it can
  build arguments for anything. A skill file is already in context.
- **A static "calls" outline per workflow.** Read from the body rather than from a run: the
  imported calls it makes, in source order, each with the `.tag("…")` its author wrote. Tags turn
  out to be the right signal precisely because they were already an outline written by the person
  who wrote the run. Labelled in the generated file as the approximation it is — a conditional
  call is listed unconditionally, a loop once, a dynamically chosen action not at all, and a call
  made inside a helper function is invisible to it.
- **`omkit skill --check`.** Compares a `registry-hash` carried in the file's header against a
  fresh read of the project and exits non-zero on drift, for a pre-commit hook or a CI step. The
  hash covers the registry — names, paths, summaries, modes, schemas, outlines — and deliberately
  not the rendered markdown, so reformatting the file is not drift while an edited om is.
- **`omkit ls --describe`.** Renders each entry's summary and an `[mcp]` / `[mcp, long-lived]`
  marker, from the same discovery fork. Opt-in on purpose: plain `omkit ls` stays the static scan
  and nothing else, which is what keeps it instant and safe to run in a repo whose oms would
  otherwise start servers.
- `--out` and `--root` for `omkit skill` — where the file lands, and what its recorded paths are
  relative to. The root defaults to the tsconfig's directory, which is the same place for the
  common layout; `--root` covers a repo that keeps its om project in a subfolder, where the
  reader's working directory is the repo and so the paths must be too.
- `RegistrationSet.registry` — the static scan that chose the candidate files, carried through so
  a caller wanting both halves does not build a second TypeScript program.

- **`drivePage` — evaluate JS in a live page and report what came back.** Reaches its page
  either way round: given a capability handle it drives a page an earlier action in the same
  run published, and given a CDP address it attaches to a browser in another process. That
  second mode is what makes browser work callable from outside — `browser` and `chromePage`
  publish handles, and a handle is not something a caller across a process boundary can pass.
  Nothing is owned in either mode, so finishing, failing, or being cancelled never tears down
  the stack it attached to.
- **`chromePage` can attach to a tab that is already open**, via `match`. A string or regex
  tests the URL; a `{ js }` predicate is evaluated inside each page until one returns something
  truthy, which is the only way to select on what a URL cannot express — the title, a rendered
  element, whether the app has finished booting. No match is an error listing what _was_ open,
  rather than a silent blank tab.

### Fixed

- **Two spellings of one path no longer mean two different things** (Windows). A
  case-insensitive filesystem let `d:\repo\om.ts` and `D:\repo\om.ts` name the same file, and
  omkit keyed on the string twice. Node caches ES modules by URL, so a child forked with one
  spelling loaded a _second_ copy of omkit — and an action could not see the run it was
  running inside, failing with a bare "no active om() run". The same mismatch gave one om two
  `omHash` identities, so `logs/<name>-<hash>/` stopped meaning "every run of this om" and the
  folder `start_om` predicted was not the folder the run created. Paths are now canonicalised
  through the OS at the two points that matter: the static scan, and the fork.
  Existing run folders are unaffected — they were already written under the canonical spelling;
  it was discovery that disagreed with them.

### Changed

- `DiscoveredOm` gained `calls`, so `omkit ls --json` carries the outline. Additive, and derived
  statically, so `discover()` is still the pass that never executes user code.
- The generated `description` in the skill's frontmatter is preserved across regeneration. It is
  the field that decides whether an assistant loads the file at the right moment, so it has to say
  _when to use this_ — which is authored prose, not something a generator should overwrite. The
  built-in wording is only ever written into a file that does not exist yet.

## 0.6.0

### Added

- **`omkit mcp` — serve a project over the Model Context Protocol.** A third frontend beside
  the terminal commands and the interactive app, on stdio, so Claude and other assistants can
  list a project's runnable oms, run one, and read what the run produced. Six tools, fixed
  however many oms a project has: list them, run one and wait for a verdict, start one and get
  a handle, check on a run, tail its log from a cursor, cancel it.
- **`om(name).mcp({ mode })` and `action(name).mcp({ mode })`** — the exposure marker. Without
  it an entry is invisible to the server: `.describe()` and `.args()` alone expose nothing, so
  a project opts in per entry. `mode` is `"settling"` (the default) or `"long-lived"`; MCP has
  no way to say a tool never finishes, so omkit says it instead, and `run_om` refuses a
  long-lived entry rather than blocking on it.
- **Run folders as MCP resources**, under `omkit://runs/{run}/latest/{file}` and
  `omkit://runs/{run}/{date}/{time}/{file}`. The `latest` form is what a stable run identity
  buys: an assistant can ask for the last run of an om without having watched it happen. Every
  read is confined under the project's `logs/`, checked lexically and through the resolved real
  path, size-capped, and read-only.
- **Progress, cancellation and elicitation during a run.** Milestones become progress
  notifications keyed on the run's own log sequence; a cancelled request tears the run down and
  it still writes its record; and a prompt raised mid-run reaches the client as an elicitation.
  A client that declines, or cannot elicit, gets the prompt's default instead of leaving the run
  waiting.
- **`discoverRegistrations()` / `readRegistrations()` on the client.** Reads what a project's
  oms and actions declare — summaries and real argument schemas — by importing them in a
  throwaway child with `OMKIT_DISCOVER=1`, where `.run(body)` registers instead of launching.
  Necessary because importing an om file runs it. `discover()` is unchanged and still never
  executes user code, so `omkit ls` is exactly as fast as before.
- **Action-backed tools.** An exposed action is forked through a host om omkit ships, since an
  action cannot run outside a run. Its runs land in the same `logs/` tree, under a name that
  carries the action's own identity, so two same-named actions in different files never share a
  folder.
- `RunOptions.env` — extra environment for a run's child process. This is how arguments reach
  a run the server starts.

### Fixed

- **Two runs of the same om starting within the same second no longer share a run folder.**
  Folder names have second resolution, and `raw.jsonl` is opened truncating — so a collision
  did not mean "the later run wins", it meant both processes truncated the same file and wrote
  at independent offsets, leaving bytes that were not valid JSONL. Creating the directory is now
  itself the lock (`mkdir` without `recursive` fails atomically, across processes), and a
  genuine collision gets a `-02` suffix. Names are unchanged in the ordinary case.

### Notes

- Nothing changes for a project that never calls `.mcp()`. The MCP SDK is imported only under
  the new `mcp/` folder, so the runtime is untouched for everyone else.

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
