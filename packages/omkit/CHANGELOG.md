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

- **`typescript` moved from `devDependencies` to `dependencies`.** Three shipped modules import
  it at runtime, and one of them — discovery — runs on every command, so an install that did not
  already happen to have TypeScript nearby failed with `ERR_MODULE_NOT_FOUND` on `omkit ls`. It
  went unnoticed because a monorepo hoists it into place.
- **A node's log file no longer spells its name out as directories.** A node's id is
  `<name>_<shortId>`, ids are joined with `/` into node paths, and those paths become log file
  paths — so a name carrying its own separators was read as tree nesting. A `command` node is
  named after its whole command line, and one watcher's log ended up nine directories deep, with
  `docs`, `packages` and `tskb` as real folders inside the run. Names are now sanitised where the
  id is made, which is the only place the two kinds of separator are still distinguishable, and
  the name's contribution to an id is capped so a long command line cannot push a log path past
  Windows' 260-character limit. Displayed names are untouched: nodes are shown by name, never by
  id.

- **One project, one `logs/` tree.** A run's record now lands under the project that owns the
  config, wherever the run was started from. It used to follow the working directory, and the
  frontends chose different ones: `omkit run` set it to the om file's own directory, so a project
  with oms in several folders accumulated a `logs/` beside each of them, while the MCP server used
  the directory it happened to be launched in — with the result that a run started in the terminal
  and a run started by an assistant wrote to two different trees, and neither could read the
  other's record. The child's cwd is unchanged, so relative paths inside an om body still resolve
  where their author reads them. Folder _names_ are unchanged; only their parent moves, so records
  written before this land in the old location and stay readable there.
- **A generated skill now documents commands that work.** `omkit skill` was given a config path and
  dropped it from everything it wrote, so a project whose om files live in a subfolder got a file
  whose every command failed at the root the file itself is read from. The `--tsconfig` the project
  needs is now carried into each rendered command, including the `claude mcp add` line, and the run
  folder is spelled from the root rather than as a bare `logs/`.
- **An om name with a space is quoted** in the commands the skill writes. Names are free text, and
  `omkit run DTF Tests` resolves the target as `DTF` and leaves `Tests` as a stray positional.
- **The shell example is one that can actually be run.** It was whichever om sorted first, which for
  one real project was a long-lived one — an example that hangs, two paragraphs above the heading
  saying it never finishes. A settling om is preferred; when a project has none, the example says so
  on the line itself.
- **The `OMKIT_ARGS` example is built from the schema** instead of by pattern-matching the rendered
  type sketch. The old reading recognised `{ field: type` and nothing else, so an om whose first
  field was an enum silently produced `OMKIT_ARGS='{}'` — syntactically fine, and wrong about the
  project. Examples now carry every required field (or one optional field when nothing is required),
  take an enum's first member and a declared default where there is one, and are omitted entirely
  when no complete example can be built.

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

- **`omkit skill --root` now defaults to the enclosing repository**, not to the tsconfig's own
  directory. The root decides where `.claude/` goes and what the recorded paths are relative to,
  and a skill file is read with the repository as the working directory — so the old default was
  wrong for exactly the layout (`om/` beside the code it drives) that needed it, and had to be
  corrected with a second flag. `--root` remains, for a project deliberately not at the top of its
  checkout.
- `RunOptions.env` now carries `OMKIT_ROOT` by default — the project owning the client's config.
  A caller may still set its own; the MCP server does, naming the root it serves resources from.
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
