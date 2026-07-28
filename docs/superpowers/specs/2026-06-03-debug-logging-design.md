# Centralized `debug`-based Logging for tskb

**Date:** 2026-06-03
**Status:** Approved (design) — ready for implementation plan

## Problem

The tskb library's logging is a single module-level `isVerbose` boolean in
[`packages/tskb/src/cli/utils/logger.ts`](../../../packages/tskb/src/cli/utils/logger.ts).
It offers only on/off verbosity, no subsystem scoping, and no way to "log lots of
things, visible only when asked." We want a modern, centralized strategy built on
the `debug` library that the whole node lib can use, with a parallel setup for the
isolated browser explorer-spa.

## Goals

- Adopt `debug` as the single diagnostic/logging system (full replacement of the
  current logging functions).
- Centralize initialization so every node module obtains a namespaced logger from
  one factory.
- Provide **levels of verbosity** (a numeric gate) on top of `debug`'s namespaces.
- Keep certain messages always visible by default (build progress, "Explorer
  running at…", errors).
- Provide a separate but convention-compatible setup for the browser explorer-spa.

## Non-Goals

- No change to stdout command-result output (`jsonOut` / `plainOut`). That is
  program output, not logging, and must stay clean (see the existing
  `logging.tskb.tsx` constraint doc).
- No build restructuring to physically share logger code across the node and
  browser builds (they are isolated Vite/tsc projects).

## Constraints

- **stdout stays clean.** All logging goes to stderr (node) / console (browser).
  `jsonOut`/`plainOut` remain the only stdout writers.
- The browser `explorer-app` is an isolated project (own `tsconfig`, no `../src`
  imports). It gets its own logger module sharing only conventions.

## Architecture

A runtime-agnostic **level + namespace** model, implemented twice (node + browser),
sharing only the `tskb:` namespace root and the level names.

### File layout

**Node** — new neutral home `packages/tskb/src/log/` (fixes the current core→cli
layering inversion, where `core/explorer/server.ts` imports from `cli/utils/logger.ts`):

- `src/log/index.ts` — `createLogger(namespace)` factory + `configure()`, wrapping `debug`.
- `src/cli/utils/logger.ts` — reduced to **only** `jsonOut` / `plainOut` (stdout
  output). All logging functions removed; call sites migrated to `createLogger`.

**Browser** — `packages/tskb/explorer-app/src/log.ts`:

- Same factory shape and level names; config sourced from `localStorage.debug`,
  `localStorage.tskb_log_level`, and a `?debug=` / `?log=` URL-param helper.
- Vite auto-resolves `debug`'s browser build.

### Namespace scheme

- Node: `tskb:cli:build`, `tskb:cli:search`, `tskb:cli:pick`, … , `tskb:core:graph`,
  `tskb:core:explorer`.
- Browser: `tskb:app:router`, `tskb:app:store`, `tskb:app:search-worker`,
  `tskb:app:render`, etc.

## The two-tier emit model

> **Revised after first implementation.** The original design routed _everything_
> (including user-facing `info`) through `debug` with all `tskb:*` namespaces
> enabled by default. In practice that decorated normal CLI output with a colored
> namespace + timing prefix on stderr — noisy and unexpected for default runs. The
> model below replaces it: normal output is plain and visible; `debug` is the
> opt-in "show me more" firehose.

`createLogger(ns)` returns an object with five level methods, split into two tiers:

```
error = 0   warn = 1   info = 2   |   debug = 3   trace = 4
        normal output (always-on)  |   firehose (opt-in, namespaced)
```

**Tier 1 — normal output (always on).** `error`/`warn`/`info` are plain and
undecorated (no namespace, no color, no timestamp), gated only by the numeric
threshold:

- `info` → **stdout** (this is the lib's user-facing output: build/explore
  progress, stats, "Done!").
- `warn` / `error` → **stderr**.

**Tier 2 — the firehose (opt-in).** `debug`/`trace` go through the `debug` lib:
namespaced (`tskb:<area>`) and colored, written to **stderr**. **Off by default.**
Enabled with `--verbose` (all `tskb:*`) or `DEBUG=tskb:cli:build` (one area).
Emits only if **both** gates pass: namespace enabled AND level ≤ threshold.

### Defaults

- Firehose namespaces: **disabled** (debug's natural default).
- Threshold = `info` (so `error`/`warn`/`info` show; `debug`/`trace` don't).
- Enabling the firehose (`--verbose` or any `DEBUG`) raises the threshold to
  `trace` so the firehose is actually visible.

Result: default runs show clean lib output on stdout, errors/warnings on stderr,
and nothing decorated. `--verbose` / `DEBUG` add the colored diagnostic stream on
stderr without touching the normal stdout output.

### Query commands stay clean

Query commands (search/pick/ls/context/docs/flows/registry) emit their JSON /
`--plain` result via `jsonOut`/`plainOut` to stdout and use only `time()` (firehose
level). They never call `info`, so their stdout stays pure data and their stderr is
empty at the default level.

### Laziness

The cheap numeric level compare runs **first** and returns before any formatting.
`log.trace("graph %O", huge)` costs nothing at the default level. Function-form
`log.trace(() => expensive())` is supported for the rare very-expensive case.

### Stream/decoration summary

| Level | Stream | Decoration                | Default visible? |
| ----- | ------ | ------------------------- | ---------------- |
| error | stderr | plain                     | yes              |
| warn  | stderr | plain                     | yes              |
| info  | stdout | plain                     | yes              |
| debug | stderr | `debug` (namespace+color) | no (opt-in)      |
| trace | stderr | `debug` (namespace+color) | no (opt-in)      |

## Toggling & configuration

### Node (`configure()`, called once at CLI startup in `cli/index.ts`)

- Firehose namespaces: enabled only when `--verbose` (→ `tskb:*`) or an explicit
  `DEBUG` env (read by the debug lib on import). Off otherwise.
- Level: `TSKB_LOG_LEVEL` env (`error`…`trace` or `0`…`4`) if set; else `trace`
  when the firehose is on (`--verbose` or `DEBUG` present); else `info`.
- `--verbose` flag → enables `tskb:*` (preserving any explicit `DEBUG`) and raises
  the level so the firehose shows.

### Browser (`explorer-app/src/log.ts`)

- Namespaces: `localStorage.debug`.
- Level: `localStorage.tskb_log_level`, else `info`.
- URL helper: `?debug=tskb:*&log=trace` writes through to localStorage on load, so a
  shareable URL enables diagnostics without a devtools dance.

## Object / state logging

- Node sets `debug.inspectOpts.depth = 4` (overridable via `DEBUG_DEPTH`) so nested
  state isn't truncated to `[Object]`.
- Callers use `%O` (multi-line inspect), `%o` (single-line), `%j` (JSON).
- Documented in the constraint doc.

## Migration scope (this change)

- Rewrite the node logger; migrate all `verbose()` / `time()` / `infoTime()` /
  `info()` / `error()` call sites (~14 files) to `createLogger(...)` level methods.
- Replace the ~16 raw `console.*` calls in `explorer-app` (`main.ts`,
  `BoundaryRenderer.ts`, `search.worker.ts`) with namespaced loggers.
- `jsonOut` / `plainOut` untouched.
- Update `docs/src/tskb/cli/logging.tskb.tsx` constraint doc to describe the new
  model, then run `npm run build:docs`.
- Add `debug` + `@types/debug` to dependencies.

### Out of scope

- Any change to stdout result formatting.
- Restructuring the build to physically share logger code across runtimes.

## Testing / verification

- `npm run build:lib` and `npm run build:explorer` both compile.
- Manual: a query command (e.g. `tskb search`) emits clean stdout with nothing on
  stderr at default level; `--verbose` and `DEBUG=tskb:*` open the firehose to stderr.
- Browser: `localStorage.debug = 'tskb:*'` + `tskb_log_level = 'trace'` (or
  `?debug=tskb:*&log=trace`) surfaces app diagnostics in the console.
