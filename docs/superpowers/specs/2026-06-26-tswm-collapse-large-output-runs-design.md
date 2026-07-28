# tswm — collapse large output runs in `run.log`

**Date:** 2026-06-26
**Status:** Approved (design), pending implementation plan
**Package:** `packages/tswm`

## Problem

A single process can emit a burst of output — e.g. `tskb build`'s "Output
directory" tree (~25 indented lines) plus tsc/vite ANSI noise. The renderer
groups consecutive same-source lines under one `▸ <source>` header and prints
**every** line, so one burst drowns the timeline in the durable `run.log`
artifact (observed in `logs/tskb-dev/2026-06-26/16-43-53/run.log`, 168 lines
mostly from a couple of bursts).

## Goal

When one source emits a large run of consecutive output lines, collapse it in
`run.log`: show the first few lines inline, write the full run to a text
snapshot file, and leave a pointer line to that file. Keep the machine record
(`run.jsonl`) and live output full-fidelity.

## Definitions

- **Run** — a maximal sequence of consecutive non-milestone {@link LogEntry}
  records sharing the same `source`. This is exactly the grouping the existing
  renderer performs: milestone levels (`run`, `event`, `snapshot`) render as
  their own marker lines and break the current group; everything else is
  action/proc output grouped under a `▸ <source>` header. Empty lines are
  already dropped at append time (`splitLines`), so runs contain only non-empty
  output lines.

## Decisions

- **Collapse scope:** the authoritative `run.log` produced by `writeLog` only.
  - `drain` (live console) and `streamLog` (incremental crash-insurance copy on
    disk) stay full-fidelity — real-time visibility is their purpose.
  - `run.jsonl` stays byte-for-byte raw — it is the machine record, and keeping
    it complete respects the "collector stores raw entries; presentation is the
    renderer's job" rule. Full data is always recoverable from `run.jsonl` even
    when `run.log` is collapsed.
  - On a hard kill where `writeLog` never runs, the on-disk `run.log` is the
    verbose `streamLog` copy — acceptable fallback, no data loss.
- **Thresholds (named constants, easy to tune):**
  - `COLLAPSE_HEAD = 5` — lines shown inline before the pointer.
  - `COLLAPSE_THRESHOLD = 15` — collapse only runs **longer than** 15 lines, so a
    trigger always hides a meaningful amount (≥ ~10 lines). Runs of ≤ 15 lines
    render exactly as today.
- **Snapshot content & format:** the **full run** (all lines, in order) written
  as a plain `.log` text file (one source line per file line) — human-readable,
  copy-pasteable, matches raw output. The first `COLLAPSE_HEAD` lines therefore
  appear both inline and in the file; that redundancy keeps the file
  self-contained.

## Rendered shape

Before (current):

```
▸ TSKB:root:watch:docs
	asdasd
	tskb build...
	Discovering files...
	... (20+ more lines) ...
	   └─ ./packages/tskb/dist
```

After (collapsed):

```
▸ TSKB:root:watch:docs
	asdasd
	tskb build...
	Discovering files...
	Found 30 documentation files
	TypeScript magic happening...
	📎 … +18 more lines → logs/tskb-dev/2026-06-26/16-43-53/output-TSKB-root-watch-docs-06.log
```

The pointer is an indented line within the group (`\t` + a `📎`-marked message),
reusing the snapshot glyph already documented in the `run.log` header legend.
`+18` = total run length − `COLLAPSE_HEAD`.

## Architecture — pure decision vs. effect

Keep `render.ts` pure (no fs) and let `output.ts` own the filesystem effect.

### `render.ts` — batch segmenter (pure)

Add a batch function that consumes a full ordered entry list and yields display
items. The existing online `createRenderer` (used by `drain` and `streamLog`) is
**unchanged**.

```ts
/** A run collapsed for display: the source and its full set of output lines. */
export interface CollapsedRun {
  readonly source: string;
  readonly lines: readonly string[];
}

/** One item in the batch-rendered stream: a ready text line, or a run to collapse. */
export type DisplayItem = { kind: "line"; text: string } | { kind: "collapsed"; run: CollapsedRun };

export interface SegmentOptions {
  head?: number; // default COLLAPSE_HEAD
  threshold?: number; // default COLLAPSE_THRESHOLD
}

/**
 * Segments raw entries into display items: milestones and short runs become
 * rendered `line` items (identical to createRenderer's output); a run longer
 * than `threshold` becomes a single `collapsed` item carrying every line of the
 * run. Pure — no fs, no snapshot writing.
 */
export function segmentForFile(
  entries: readonly LogEntry[],
  options?: SegmentOptions
): DisplayItem[];
```

Segmentation mirrors `createRenderer`'s grouping rules exactly (same milestone
set, same `lastSource` reset on milestone) so non-collapsed output is
byte-identical to today.

### `output.ts` — materialize in `writeLog`

`writeLog` replaces its `entries.map(render)` pretty pass with: run
`segmentForFile(entries)`, then for each item:

- `line` → emit `text`.
- `collapsed` → write the run's full `lines` to a text snapshot via a new
  `captureText` helper; emit `COLLAPSE_HEAD` rendered head lines (the
  `▸ <source>` header on the first, `\t<line>` after) followed by
  `\t${marker("snapshot", "… +<K> more lines → <rel>")}`.

```ts
/**
 * Writes raw text lines as a sequenced `.log` snapshot file in the run dir and
 * returns its path refs — the text sibling of captureSnapshot (which writes
 * JSON). Used to off-load a collapsed output run from run.log.
 */
export const captureText = (name: string, lines: readonly string[]): SnapshotRef;
```

`captureText` reuses the run dir, `seq` counter, `ensureDir`, and the
relative/forward-slash path normalization already in `output.ts`. Snapshot file
name: `output-<safe-source>-NN.log`.

`run.jsonl` writing in `writeLog` is unchanged.

## Edge cases

- Run length ≤ `COLLAPSE_THRESHOLD` → rendered exactly as today.
- Milestones interleaved mid-burst break the run (handled by mirroring
  `createRenderer`).
- Multiple collapsed runs from the same source → distinct files via the `seq`
  counter.
- `COLLAPSE_HEAD < COLLAPSE_THRESHOLD` always, so head never exceeds the run.

## Testing

- **Unit (vitest):** the pure `segmentForFile`:
  - a sub-threshold run passes through as `line` items identical to
    `createRenderer` output;
  - an over-threshold run yields one `collapsed` item carrying all lines;
  - a milestone in the middle splits one long run into two shorter runs (no
    collapse if each is under threshold);
  - the `+K` count equals `lines.length - head`.
    Run via the repo's existing vitest. Confirm the test file is discovered and
    green.
- **Manual:** regenerate a dev log (`node wm/src/pipelines/tskb-build.ts` or the
  dev pipeline), confirm a large run shows head + `📎` pointer in `run.log`, the
  `output-*.log` file holds the full run, and `run.jsonl` still has every line.

## Out of scope (future)

- Stripping ANSI escape sequences from tsc/vite output.
- Collapsing live `drain`/`streamLog` output (online, no lookahead).
- Collapsing single very long lines (a different unit).
- Making thresholds configurable via `RunOptions` (constants suffice for now).
