import ts from "typescript";
import type { OmCall } from "./registry.ts";

/**
 * Every identifier a file binds through an import — the whole allow-list for the outline.
 * An action always arrives by import (`omkit/actions`, or a local actions module), so
 * "was imported" is a cheap stand-in for "is a step" that never needs the type checker.
 */
export function importedNames(sf: ts.SourceFile): ReadonlySet<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const clause = stmt.importClause;
    if (clause.name) names.add(clause.name.text);
    const bindings = clause.namedBindings;
    if (!bindings) continue;
    if (ts.isNamespaceImport(bindings)) names.add(bindings.name.text);
    else for (const el of bindings.elements) names.add(el.name.text);
  }
  return names;
}

/** A fluent chain resolved down to the call that starts it: `a(…).b().c()` → the `a(…)`. */
export interface ChainRoot {
  /** The identifier the chain is rooted in. */
  readonly name: string;
  /** The base call itself, so a caller can read its arguments. */
  readonly call: ts.CallExpression;
  /** Every call in the chain, outermost first. */
  readonly calls: readonly ts.CallExpression[];
}

/**
 * Walk a fluent chain down from any of its calls to the identifier call at its root.
 *
 * Descends through `.expression` rather than climbing through `.parent`: a `SourceFile` from
 * `ts.createProgram` only has parent pointers once its file has been bound, so climbing would
 * work or not depending on whether the caller happened to ask for diagnostics first.
 */
export function chainRoot(node: ts.CallExpression): ChainRoot | undefined {
  const calls: ts.CallExpression[] = [];
  let current: ts.Node = node;
  while (ts.isCallExpression(current)) {
    calls.push(current);
    const callee = current.expression;
    if (ts.isPropertyAccessExpression(callee)) {
      current = callee.expression;
      continue;
    }
    if (ts.isIdentifier(callee)) return { name: callee.text, call: current, calls };
    return undefined;
  }
  return undefined;
}

/**
 * A static sketch of what an om body calls: imported identifiers invoked directly inside
 * `.run(body)`, in source order, each paired with the `.tag("…")` from its own fluent chain.
 *
 * Deliberately an approximation, and labelled as one wherever it is rendered. A conditional
 * call appears unconditionally, a loop appears once, an action picked dynamically does not
 * appear at all, and a call made inside a module-level helper is invisible — the walk does
 * not follow indirection. It answers "roughly what happens in here" and nothing stronger.
 */
export function outlineBody(body: ts.Node, imported: ReadonlySet<string>): OmCall[] {
  const calls: OmCall[] = [];
  const seen = new Set<string>();

  const visit = (node: ts.Node): void => {
    const chain = ts.isCallExpression(node) ? chainRoot(node) : undefined;
    if (chain && imported.has(chain.name)) {
      const tag = tagOf(chain);
      // Name and tag together are the identity: three `command` calls with distinct tags are
      // three steps, while the same call written twice is one.
      const key = `${chain.name} ${tag ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        calls.push(tag === undefined ? { name: chain.name } : { name: chain.name, tag });
      }
      // The chain's own spine is now accounted for; only its arguments can hold further steps.
      // Walking it again would re-enter each inner call and record the same step repeatedly.
      for (const call of chain.calls) for (const arg of call.arguments) visit(arg);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return calls;
}

/**
 * The `.tag("…")` on a chain, taken nearest its root. `calls` is outermost-first, so the last
 * match is the innermost — the tag attached directly to the action rather than to something
 * further along the chain.
 */
function tagOf(chain: ChainRoot): string | undefined {
  let tag: string | undefined;
  for (const call of chain.calls) {
    const callee = call.expression;
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "tag") continue;
    const arg = call.arguments[0];
    if (arg && ts.isStringLiteralLike(arg)) tag = arg.text;
  }
  return tag;
}
