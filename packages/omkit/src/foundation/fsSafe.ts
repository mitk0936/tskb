/**
 * Make one path segment safe to use as a filename on any OS. Windows is the
 * strictest — it forbids `<>:"/\|?*` (a `:` in an action name like
 * `TSKB:root:watch:docs` would otherwise crash the log writer). We keep it simple:
 * collapse every run of non-`[A-Za-z0-9._-]` characters to a single `-`.
 */
export const fsSafe = (segment: string): string => segment.replace(/[^a-zA-Z0-9._-]+/g, "-");
