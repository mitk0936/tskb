import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { Box, Text, useInput } from "ink";

/** Hard cap on visible rows, regardless of `max`. */
const MAX_VISIBLE = 15;

export interface SearchableListProps<T> {
  items: T[];
  /** Stable React key per item. */
  getKey: (item: T) => string;
  /** Text the type-to-filter search matches against (case-insensitive substring). */
  getSearchText: (item: T) => string;
  /** Draw one row; `selected` is the highlighted item. */
  renderRow: (item: T, selected: boolean) => ReactNode;
  onSelect: (item: T) => void;
  /** Where the highlight starts (e.g. a prompt's default). Default 0. */
  initialIndex?: number;
  /** Viewport size; clamped to {@link MAX_VISIBLE}. Default {@link MAX_VISIBLE}. */
  max?: number;
  /** Prefix for the search line. Default "search: ". */
  searchLabel?: string;
}

/**
 * A searchable, arrow-navigable list with a scrolling viewport. Owns search, selection, and
 * windowing; the caller owns row rendering via {@link SearchableListProps.renderRow}. The
 * `search:` line and the `+N more` footer only appear once the list overflows the viewport
 * (or the user starts typing), so short lists stay a plain arrow list.
 */
export function SearchableList<T>({
  items,
  getKey,
  getSearchText,
  renderRow,
  onSelect,
  initialIndex = 0,
  max = MAX_VISIBLE,
  searchLabel = "search: ",
}: SearchableListProps<T>): ReactElement {
  // Refs hold the authoritative query/index: Ink can deliver several key events before React
  // re-renders, so the Enter handler must read refs, not a possibly-stale render closure. State
  // mirrors the refs only to drive the display.
  const queryRef = useRef("");
  const indexRef = useRef(initialIndex);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(initialIndex);

  const match = (q: string): T[] => {
    const needle = q.toLowerCase();
    return needle ? items.filter((it) => getSearchText(it).toLowerCase().includes(needle)) : items;
  };
  const clampIndex = (i: number, len: number): number => Math.min(i, Math.max(0, len - 1));

  useInput((input, key) => {
    if (key.upArrow) {
      indexRef.current = Math.max(0, indexRef.current - 1);
      setIndex(indexRef.current);
    } else if (key.downArrow) {
      const len = match(queryRef.current).length;
      indexRef.current = Math.min(len - 1, clampIndex(indexRef.current, len) + 1);
      setIndex(indexRef.current);
    } else if (key.return) {
      const list = match(queryRef.current);
      const picked = list[clampIndex(indexRef.current, list.length)];
      if (picked) onSelect(picked);
    } else if (key.backspace || key.delete) {
      queryRef.current = queryRef.current.slice(0, -1);
      indexRef.current = 0;
      setQuery(queryRef.current);
      setIndex(0);
    } else if (input && !key.ctrl && !key.meta) {
      queryRef.current += input;
      indexRef.current = 0;
      setQuery(queryRef.current);
      setIndex(0);
    }
  });

  const filtered = match(query);
  const selected = clampIndex(index, filtered.length);

  const window = Math.min(max, MAX_VISIBLE, filtered.length);
  // Slide the viewport so the selected row stays visible, without overscrolling the end.
  let start = selected >= window ? selected - window + 1 : 0;
  start = Math.min(start, Math.max(0, filtered.length - window));
  const visible = filtered.slice(start, start + window);
  const above = start;
  const below = filtered.length - (start + window);

  const overflows = items.length > Math.min(max, MAX_VISIBLE);
  const showSearch = overflows || query.length > 0;

  return (
    <Box flexDirection="column">
      {showSearch ? (
        <Text dimColor>
          {searchLabel}
          {query}
        </Text>
      ) : null}
      {above > 0 ? <Text dimColor>{`↑ ${above} more`}</Text> : null}
      {filtered.length === 0 ? <Text dimColor>no matches</Text> : null}
      {visible.map((it, vi) => (
        <Box key={getKey(it)}>{renderRow(it, start + vi === selected)}</Box>
      ))}
      {below > 0 ? <Text dimColor>{`+${below} more`}</Text> : null}
    </Box>
  );
}
