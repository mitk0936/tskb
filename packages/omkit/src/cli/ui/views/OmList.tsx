import path from "node:path";
import { type ReactElement } from "react";
import { Text } from "ink";
import { SearchableList } from "./SearchableList.tsx";
import type { DiscoveredOm } from "../../client/registry.ts";

/** Show the om's path relative to cwd when it's inside the project; else the absolute path. */
function displayPath(file: string): string {
  const rel = path.relative(process.cwd(), file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : file;
}

/** A searchable, arrow-navigable list of oms; Enter selects the highlighted one. */
export function OmList({
  oms,
  onSelect,
}: {
  oms: DiscoveredOm[];
  onSelect: (om: DiscoveredOm) => void;
}): ReactElement {
  // Column width so paths line up; capped so one long name can't push paths off-screen.
  const nameWidth = Math.min(
    30,
    oms.reduce((w, o) => Math.max(w, o.name.length), 0)
  );

  return (
    <SearchableList
      items={oms}
      getKey={(o) => o.name}
      getSearchText={(o) => o.name}
      onSelect={onSelect}
      renderRow={(o, selected) => (
        <Text>
          <Text color={selected ? "cyan" : undefined}>{selected ? "❯ " : "  "}</Text>
          <Text bold={selected}>{o.name.padEnd(nameWidth)}</Text>
          {"  "}
          <Text dimColor>{displayPath(o.file)}</Text>
        </Text>
      )}
    />
  );
}
