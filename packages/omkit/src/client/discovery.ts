import ts from "typescript";
import path from "node:path";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { omHash } from "../foundation/ids.ts";
import { fsSafe } from "../foundation/fsSafe.ts";
import { canonicalPath } from "../foundation/canonicalPath.ts";
import { tsxLoader } from "./runner.ts";
import { chainRoot, importedNames, outlineBody } from "./outline.ts";
import type { OmRegistrationMessage } from "../core/discovery-mode.ts";
import type { ActionsMessage, ScanMessage } from "./discover-child.ts";
import type {
  Registry,
  DiscoveredOm,
  DiscoveredAction,
  ActionRegistration,
  OmCall,
  OmRegistration,
  RegistrationSet,
} from "./registry.ts";

/** Local binding names imported from "omkit" (handles `import { om as run } from "omkit"`). */
interface OmkitNames {
  om?: string;
  step?: string;
  action?: string;
}

/**
 * Statically scan the project described by `tsconfigPath` for runnable oms and inspectable
 * actions. Type errors in the user's oms/actions degrade to `warnings` (an editor-in-progress
 * project stays useful), but a **fatal config problem** — a missing, unparseable, or invalid
 * tsconfig — throws, so the CLI crashes visibly instead of silently returning an empty project.
 */
export function discover(tsconfigPath: string): Registry {
  const oms: DiscoveredOm[] = [];
  const actions: DiscoveredAction[] = [];
  const warnings: string[] = [];

  const { parsed, warnings: configWarnings } = loadProject(tsconfigPath);
  warnings.push(...configWarnings);
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
  });
  const fileSet = new Set(parsed.fileNames.map((f) => canonical(f)));

  for (const sf of program.getSourceFiles()) {
    if (!fileSet.has(canonical(sf.fileName))) continue;

    // TypeScript hands back its own spelling of the path — on Windows it lowercases the drive
    // letter — and every consumer downstream keys on this string: the discovery fork imports
    // it, `omHash` hashes it, and Node caches modules by it. Canonicalise once here so the
    // whole chain agrees with the filesystem, and with the paths a real run reports.
    const file = canonicalPath(sf.fileName);

    for (const d of program.getSemanticDiagnostics(sf)) warnings.push(formatDiagnostic(d));

    const names = omkitImports(sf);
    const outlines = outlinesIn(sf, names.om, importedNames(sf));

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === names.om || node.expression.text === names.step)
      ) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteralLike(arg)) {
          const calls = outlines.get(arg.text);
          oms.push({
            name: arg.text,
            file,
            line: lineOf(sf, node),
            ...(calls?.length ? { calls } : {}),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    for (const stmt of sf.statements) {
      if (!ts.isVariableStatement(stmt) || !isExported(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (!decl.initializer || !ts.isIdentifier(decl.name)) continue;
        const info = actionChain(decl.initializer, names.action);
        if (info) {
          actions.push({
            name: info.name,
            file,
            exportName: decl.name.text,
            publishesCapability: info.ref,
            events: info.emits,
          });
        }
      }
    }
  }

  return { oms, actions, warnings };
}

/**
 * Outline every `om("name")…​.run(body)` chain in a file, keyed by om name.
 *
 * Collected in its own pass rather than alongside the `om(...)` match, because a body is only
 * reachable from the `.run` end of the chain and the om name only from the other — and the
 * chain is walked downward (see {@link chainRoot}), so one pass cannot have both.
 */
function outlinesIn(
  sf: ts.SourceFile,
  omName: string | undefined,
  imported: ReadonlySet<string>
): Map<string, OmCall[]> {
  const outlines = new Map<string, OmCall[]>();
  if (omName === undefined) return outlines;

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "run"
    ) {
      const root = chainRoot(node);
      const body = node.arguments[0];
      const name = root?.call.arguments[0];
      if (root?.name === omName && name && ts.isStringLiteralLike(name) && body) {
        if (ts.isFunctionLike(body)) outlines.set(name.text, outlineBody(body, imported));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return outlines;
}

/** How long the child gets to import every file before it is killed and reported. */
const DISCOVER_TIMEOUT_MS = 30_000;

/**
 * Absolute path of a sibling module, carrying the extension this build actually uses —
 * `.ts` under tsx and vitest, `.js` once compiled. `rewriteRelativeImportExtensions`
 * rewrites import specifiers; this path is data (a fork target), so it does not.
 */
function siblingScript(name: string): string {
  const here = fileURLToPath(import.meta.url);
  return path.join(path.dirname(here), `${name}${path.extname(here)}`);
}

/** Project an om's registration message onto the client-facing shape, folder name and all. */
function toOmRegistration(m: OmRegistrationMessage): OmRegistration {
  return {
    name: m.name,
    file: m.file ?? "",
    folderName: `${fsSafe(m.name)}-${omHash(m.name, m.file)}`,
    ...(m.description ? { summary: m.description.summary } : {}),
    ...(m.mcp ? { mcp: m.mcp } : {}),
    ...(m.inputSchema ? { inputSchema: m.inputSchema } : {}),
    ...(m.schemaError ? { unavailable: m.schemaError } : {}),
  };
}

/**
 * Import `files` in a throwaway child with `OMKIT_DISCOVER=1` and collect what they
 * declare. Exposed separately from {@link discoverRegistrations} so the fork can be driven
 * with an explicit file list — by tests, and by anything that already knows its candidates.
 *
 * Never rejects for user-code problems: an import failure, a crashed child, or a child
 * that outstays its timeout all come back as warnings on an otherwise usable set.
 */
export function readRegistrations(
  files: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<RegistrationSet> {
  if (files.length === 0) return Promise.resolve({ oms: [], actions: [], warnings: [] });
  const timeoutMs = opts.timeoutMs ?? DISCOVER_TIMEOUT_MS;

  return new Promise((resolve) => {
    const oms: OmRegistration[] = [];
    const warnings: string[] = [];
    const child = fork(siblingScript("discover-child"), [], {
      execArgv: ["--import", tsxLoader],
      cwd: opts.cwd ?? path.dirname(files[0]!),
      env: { ...process.env, OMKIT_DISCOVER: "1" },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    let settled = false;
    const finish = (actions: ActionRegistration[]): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (child.exitCode === null && child.signalCode === null) child.kill();
      resolve({ oms, actions, warnings });
    };

    const timer = setTimeout(() => {
      warnings.push(`discovery timed out after ${timeoutMs}ms`);
      finish([]);
    }, timeoutMs);

    child.on("message", (message: unknown) => {
      const m = message as OmRegistrationMessage | ActionsMessage;
      if (m.kind === "om-registration") oms.push(toOmRegistration(m));
      else if (m.kind === "actions") {
        warnings.push(...m.warnings);
        finish(m.actions);
      }
    });
    // A child that dies before reporting still yields whatever streamed in before it did.
    child.on("close", () => finish([]));
    child.on("error", (e) => {
      warnings.push(`discovery child failed: ${e.message}`);
      finish([]);
    });

    child.send({ kind: "scan", files } satisfies ScanMessage);
  });
}

/**
 * The full pass: the AST scan picks the candidate files — it stays the only cheap,
 * never-executing phase — then {@link readRegistrations} imports just those. AST warnings
 * are carried through so nothing is lost between the two phases.
 */
export async function discoverRegistrations(
  tsconfigPath: string,
  opts: { timeoutMs?: number } = {}
): Promise<RegistrationSet> {
  const ast = discover(tsconfigPath);
  const files = [...new Set([...ast.oms.map((o) => o.file), ...ast.actions.map((a) => a.file)])];
  const set = await readRegistrations(files, {
    cwd: path.dirname(path.resolve(tsconfigPath)),
    ...opts,
  });
  return { ...set, warnings: [...ast.warnings, ...set.warnings], registry: ast };
}

/**
 * Load and validate the tsconfig, throwing on a fatal config problem — a missing/unparseable file,
 * or a config-level error (bad compilerOptions, an unresolvable `extends`). The benign "no inputs
 * found" (TS18003) is not fatal: an empty-but-valid project comes back as a warning instead.
 *
 * Parses against an absolute base dir so `parsed.fileNames` are absolute — otherwise root files
 * stay relative while imported files (an action pulled in by an om) resolve absolute, and the two
 * never match in the caller's `fileSet`.
 */
function loadProject(tsconfigPath: string): { parsed: ts.ParsedCommandLine; warnings: string[] } {
  const flatten = (d: ts.Diagnostic): string =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n");

  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error)
    throw new Error(`could not read ${tsconfigPath}: ${flatten(configFile.error)}`);

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.resolve(path.dirname(tsconfigPath))
  );
  const fatal = parsed.errors.filter(
    (e) => e.category === ts.DiagnosticCategory.Error && e.code !== 18003
  );
  if (fatal.length) {
    throw new Error(`invalid ${tsconfigPath}:\n${fatal.map((e) => `  ${flatten(e)}`).join("\n")}`);
  }
  const warnings = parsed.errors.filter((e) => e.code === 18003).map(flatten);
  return { parsed, warnings };
}

/** Collect the local names bound to om/step/action from `import … from "omkit"`. */
function omkitImports(sf: ts.SourceFile): OmkitNames {
  const names: OmkitNames = {};
  for (const stmt of sf.statements) {
    if (!isOmkitImport(stmt)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) bindName(names, el);
  }
  return names;
}

/** True for `import … from "omkit"`. */
function isOmkitImport(stmt: ts.Statement): stmt is ts.ImportDeclaration {
  return (
    ts.isImportDeclaration(stmt) &&
    ts.isStringLiteral(stmt.moduleSpecifier) &&
    stmt.moduleSpecifier.text === "omkit"
  );
}

/** Record the local binding for an imported `om` / `step` / `action` specifier. */
function bindName(names: OmkitNames, el: ts.ImportSpecifier): void {
  const imported = (el.propertyName ?? el.name).text;
  if (imported === "om") names.om = el.name.text;
  else if (imported === "step") names.step = el.name.text;
  else if (imported === "action") names.action = el.name.text;
}

/**
 * Walk a builder chain (`action("x").emits<…>().ref<…>().run(fn)`) from the outer call down to
 * the base `action("name")` call, noting whether `.ref` / `.emits` appear. Returns undefined
 * when the chain is not rooted in the local `action` binding with a string-literal name.
 */
function actionChain(
  expr: ts.Node,
  actionName: string | undefined
): { name: string; ref: boolean; emits: boolean } | undefined {
  if (actionName === undefined) return undefined;
  let ref = false;
  let emits = false;
  let node: ts.Node = expr;
  while (ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === "ref") ref = true;
      if (method === "emits") emits = true;
      node = node.expression.expression;
      continue;
    }
    if (ts.isIdentifier(node.expression) && node.expression.text === actionName) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) return { name: arg.text, ref, emits };
    }
    return undefined;
  }
  return undefined;
}

function isExported(stmt: ts.VariableStatement): boolean {
  return Boolean(stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/**
 * A canonical key for a file path. TypeScript resolves relative imports with a different
 * drive-letter case than the tsconfig `include` glob does on Windows, so a plain
 * `path.normalize` comparison misses files reached both ways. Fold case where the OS does.
 */
function canonical(file: string): string {
  const normalized = path.normalize(file);
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}

function lineOf(sf: ts.SourceFile, node: ts.Node): number {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function formatDiagnostic(d: ts.Diagnostic): string {
  const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
  if (d.file && d.start !== undefined) {
    const { line } = d.file.getLineAndCharacterOfPosition(d.start);
    return `${path.basename(d.file.fileName)}:${line + 1} ${message}`;
  }
  return message;
}
