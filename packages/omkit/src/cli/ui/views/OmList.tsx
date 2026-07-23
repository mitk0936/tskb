import { useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import type { DiscoveredOm } from "../../client/registry.ts";

/** Case-insensitive substring filter on om names. */
export function filterOms(oms: DiscoveredOm[], query: string): DiscoveredOm[] {
  const q = query.toLowerCase();
  return oms.filter((o) => o.name.toLowerCase().includes(q));
}

/** A searchable, arrow-navigable list of oms; Enter selects the highlighted one. */
export function OmList({
  oms,
  onSelect,
}: {
  oms: DiscoveredOm[];
  onSelect: (om: DiscoveredOm) => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const filtered = filterOms(oms, query);

  useInput((input, key) => {
    if (key.upArrow) {
      setIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setIndex((i) => Math.min(filtered.length - 1, i + 1));
    } else if (key.return) {
      const picked = filtered[index];
      if (picked) onSelect(picked);
    } else if (key.backspace || key.delete) {
      setQuery((q) => q.slice(0, -1));
      setIndex(0);
    } else if (input && !key.ctrl && !key.meta) {
      setQuery((q) => q + input);
      setIndex(0);
    }
  });

  return (
    <Box flexDirection="column">
      <Text>search: {query}</Text>
      {filtered.map((o, i) => (
        <Text key={o.name} inverse={i === index}>
          {o.name} {o.file}
        </Text>
      ))}
    </Box>
  );
}
