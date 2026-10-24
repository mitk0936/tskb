import ts from "typescript";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { canonicalPath } from "../foundation/canonicalPath.ts";

/**
 * A type-checking view of the project that remembers the last check. Discovery and
 * `omkit check` both build a full program and ask for every om/action file's semantic
 * diagnostics; this keeps TypeScript's incremental state in a `.tsbuildinfo` file between
 * processes, so a file whose content (and dependencies) didn't change isn't checked again.
 *
 * The program itself is still rebuilt every time — the saving is the checker's work, which
 * grows with the project's own files. The cache is best-effort throughout: a missing,
 * stale, or unwritable file only costs a full check, never a wrong answer (TypeScript
 * validates the stored state against each file's content hash).
 */
export interface CheckedProgram {
  readonly program: ts.Program;
  /** Semantic diagnostics for `sf` — from the cache when nothing it depends on changed. */
  semanticDiagnostics(sf: ts.SourceFile): readonly ts.Diagnostic[];
  /** Persist what this check learned. Never throws. */
  save(): void;
}

export function checkedProgram(parsed: ts.ParsedCommandLine, tsconfigPath: string): CheckedProgram {
  const file = buildInfoFile(tsconfigPath);
  if (!file) return uncached(parsed);
  const options: ts.CompilerOptions = {
    ...parsed.options,
    noEmit: true,
    incremental: true,
    // TypeScript compares this against its own forward-slashed spelling of the path
    tsBuildInfoFile: file.replace(/\\/g, "/"),
    // the user's own composite/outDir settings describe their build, not this check
    composite: false,
  };
  let builder: ts.EmitAndSemanticDiagnosticsBuilderProgram;
  try {
    builder = ts.createIncrementalProgram({
      rootNames: parsed.fileNames,
      options,
      host: ts.createIncrementalCompilerHost(options),
    });
  } catch {
    // a cache TypeScript can't read back (corrupt, foreign) — drop it and check from scratch
    fs.rmSync(file, { force: true });
    return uncached(parsed);
  }
  return {
    program: builder.getProgram(),
    semanticDiagnostics: (sf) => builder.getSemanticDiagnostics(sf),
    save() {
      try {
        // with `noEmit`, emitting writes only the build info
        builder.emit(undefined, (target, text) => writeAtomic(target, text));
      } catch {
        // a cache that can't be written is just a cache miss next time
      }
    },
  };
}

function uncached(parsed: ts.ParsedCommandLine): CheckedProgram {
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  return { program, semanticDiagnostics: (sf) => program.getSemanticDiagnostics(sf), save() {} };
}

/**
 * Where a project's build info lives: `node_modules/.cache/omkit/` nearest the tsconfig —
 * the usual home for tool caches, already ignored by git — else the OS temp folder.
 * Keyed by the tsconfig and the TypeScript version, so two projects (or a TS upgrade)
 * never share state. `OMKIT_CACHE_DIR` moves it; `OMKIT_NO_CACHE=1` turns it off.
 */
export function buildInfoFile(tsconfigPath: string): string | undefined {
  if (process.env.OMKIT_NO_CACHE === "1") return undefined;
  const config = canonicalPath(path.resolve(tsconfigPath));
  const key = createHash("sha1").update(`${config}\0${ts.version}`).digest("hex").slice(0, 12);
  const name = `${path.basename(config, ".json")}-${key}.tsbuildinfo`;
  for (const dir of candidateDirs(path.dirname(config))) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      return path.join(dir, name);
    } catch {
      // not writable — try the next place
    }
  }
  return undefined;
}

function candidateDirs(from: string): string[] {
  if (process.env.OMKIT_CACHE_DIR) return [path.resolve(process.env.OMKIT_CACHE_DIR)];
  const out: string[] = [];
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "node_modules"))) {
      out.push(path.join(dir, "node_modules", ".cache", "omkit"));
      break;
    }
    if (path.dirname(dir) === dir) break;
  }
  out.push(path.join(os.tmpdir(), "omkit-cache"));
  return out;
}

/** Write via a temp file + rename, so a concurrent reader (a picker, a check) never sees half a file. */
function writeAtomic(target: string, text: string): void {
  const tmp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    throw error;
  }
}
