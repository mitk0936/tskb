import path from "node:path";

/** What the listing order needs from an entry: its name, and where it is defined. */
export interface Located {
  readonly name: string;
  readonly file: string;
}

/**
 * How many directories lie between `root` and `file`: `oms/build.ts` is 1, `build.ts` is 0.
 * A file outside the root is `Infinity`, so it lists after everything the root contains rather
 * than at a depth invented from its `..` segments.
 */
export function nestingDepth(file: string, root: string): number {
  const rel = path.relative(root, file);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) return Infinity;
  return rel.split(path.sep).length - 1;
}

/**
 * The order a project's oms are presented in: shallowest first, then by name, then by file.
 *
 * Where an om sits says what it is for. The workflows at the top of a project are the ones
 * people reach for every day; one three folders down is a specialised variant or a helper
 * behind them. Listing by depth puts the core oms first without asking authors to rank them.
 * Depth is measured from the root the listing renders its paths from, so the order matches
 * the column it sits beside. The file tie-break keeps two same-named oms in a fixed order.
 */
export function byNesting(root: string): (a: Located, b: Located) => number {
  return (a, b) =>
    nestingDepth(a.file, root) - nestingDepth(b.file, root) ||
    a.name.localeCompare(b.name) ||
    a.file.localeCompare(b.file);
}
