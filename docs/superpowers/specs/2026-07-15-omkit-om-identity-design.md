# Omkit Named Runs & Path-Derived Identity — Design

**Goal:** `om(name, body)` — every run requires a name — plus a deterministic 8-hex hash of (absolute path of the file calling `om()` + name). The run's log folder becomes `logs/<name>-<hash8>/<date>/<time>/`, so consumers who define oms in same-named files across folders never collide in `logs/`.

**Status:** approved 2026-07-15. Records the change; implementation follows inline.

---

## Motivation

Today `RunFolder.name()` derives the folder from `process.argv[1]`'s basename — how the process was _launched_, not where the om is _defined_. Two pipelines both run from `pipeline.ts` in different folders collapse into one `logs/pipeline/` tree, and the name carries no intent. Requiring a name makes runs self-describing; hashing the defining file's path keeps same-named oms apart.

## API

```ts
export function om(name: string, body: (ctx: OmContext) => Awaitable<void>): Promise<void>;
```

- `name` is required and runtime-validated (non-empty string) — throws synchronously, guarding JS consumers past the type check.
- No other `OmContext` / behavior changes.

## Identity hash

- Computed once inside `om()`, from the **absolute file path of the `om()` call site** plus the name.
- The call site comes from the existing `callerSite()` (`file:line`); the trailing `:line` is **stripped** so moving the call within its file does not change the run's identity.
- `omHash(name, file)` in `foundation/ids.ts`: `sha256(`${file}\0${name}`)` hex, truncated to 8 chars. Deterministic per checkout; differs across machines (absolute paths differ) — that's fine, identity is per-checkout.
- Fallback: no stack ⇒ hash of `"\0" + name` alone — still deterministic.

## Folder layout

```
logs/
  tskb-dev-3fa9c21b/     ← fsSafe(name)-hash8
    2026-07-15/
      14-03-22/
        main.log, events.log, asserts.log, snapshots.log, raw.jsonl, result.json, …
```

- `RunFolder` takes `(name, hash)` in its constructor; `name()` returns `` `${fsSafe(name)}-${hash}` ``; the `process.argv[1]` dependency is deleted.
- `ExecutionTree` constructor becomes `(name, definedAt?)` and builds the `RunFolder` from them.
- Root node keeps id `main` / `main.log`; the `run started · …` narration now shows `<name>-<hash8>`.

## Blast radius

- **Core:** `om.ts` (signature + validation), `ExecutionTree.ts` (constructor, folder construction), `RunFolder.ts` (constructor, `name()`), `foundation/ids.ts` (`omHash`), `index.ts` (doc comment).
- **Call sites:** `wm/src/pipelines/tskb-dev.ts` → `om("tskb-dev", …)`, `tskb-build.ts` → `om("tskb-build", …)`; every test's `om(async …)` gains a name; README examples.

## Testing

New `tests/unit/om-identity.test.ts`:

- `om("", body)` / non-string name throws synchronously.
- The run folder tail matches `<name>-<hex8>` and the name is fsSafe-sanitized.
- Two runs of the same `om(name, …)` from the same file share the same folder name (determinism).
- `omHash`: same name + different files ⇒ different hashes; same inputs ⇒ same hash; 8 lowercase hex chars.

Existing suites updated mechanically (names added); `npm run build` + full vitest green.

## Out of scope

- No change to node ids, log formats, teardown, or the call-to-run model (see `2026-07-15-omkit-call-to-run-model-design.md`).
