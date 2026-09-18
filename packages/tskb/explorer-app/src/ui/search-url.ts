/**
 * The search box's query lives in the URL as `?q=…` so a reload (or a shared
 * link) lands on the same result set. The panel router owns `location.hash`;
 * these helpers touch only the query string and leave the hash intact.
 */

export const SEARCH_PARAM = "q";

/** The search query carried by a URL query string, or null when absent or blank. */
export function readSearchQuery(search: string): string | null {
  const query = new URLSearchParams(search).get(SEARCH_PARAM)?.trim();
  return query ? query : null;
}

/**
 * Returns `href` with the search query set — or removed when `query` is null or
 * blank. Other params and the hash are preserved.
 */
export function withSearchQuery(href: string, query: string | null): string {
  const url = new URL(href);
  const trimmed = query?.trim();
  if (trimmed) url.searchParams.set(SEARCH_PARAM, trimmed);
  else url.searchParams.delete(SEARCH_PARAM);
  return url.href;
}
