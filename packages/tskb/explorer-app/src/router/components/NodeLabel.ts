/**
 * Short, meaningful label for a node reference rendered in the panel. Paths are
 * what the graph carries for modules, files and folders; the panel shows the
 * last segment (the full path stays available on hover):
 *
 *   module / file → file name            `Router.ts`
 *                   `index.*` keeps its parent so it stays distinguishable: `router/index.ts`
 *   folder        → name + trailing slash `views/`
 *   anything else → `display` unchanged (exports are formatted by exportDisplayLabel)
 *
 * A `display` without a path (a registry key for a node whose chunk has not
 * loaded, or a root-level file) is returned as is.
 */
export function shortNodeLabel(type: string | null | undefined, display: string): string {
  if (type === "module" || type === "file") return fileLabel(display);
  if (type === "folder") return folderLabel(display);
  return display;
}

function fileLabel(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const name = parts[parts.length - 1];
  if (!name || parts.length < 2) return path;
  return /^index\.[^.]+$/.test(name) ? `${parts[parts.length - 2]}/${name}` : name;
}

function folderLabel(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const name = parts[parts.length - 1];
  if (!name || name === ".") return path;
  return `${name}/`;
}
