import path from "node:path";
import { useMemo, type ReactElement } from "react";
import { Text } from "ink";
import { SearchableList } from "./SearchableList.tsx";
import { byNesting } from "../../../client/order.ts";
import type { DiscoveredOm } from "../../../client/registry.ts";

/** Show the om's path relative to `root` when it's inside it; else the absolute path. */
function displayPath(file: string, root: string): string {
  const rel = path.relative(root, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : file;
}

/**
 * A searchable, arrow-navigable list of oms; Enter selects the highlighted one.
 *
 * Rows are ordered by {@link byNesting} from the working directory — the same root the path
 * column is rendered from, so the order matches what the column shows: the oms nearest the
 * top of the project first, deeper ones after, and any shown as an absolute path last.
 */
export function OmList({
  oms,
  onSelect,
}: {
  oms: DiscoveredOm[];
  onSelect: (om: DiscoveredOm) => void;
}): ReactElement {
  const root = process.cwd();
  const sorted = useMemo(() => [...oms].sort(byNesting(root)), [oms, root]);

  // Column width so paths line up; capped so one long name can't push paths off-screen.
  const nameWidth = Math.min(
    30,
    oms.reduce((w, o) => Math.max(w, o.name.length), 0)
  );

  return (
    <SearchableList
      items={sorted}
      getKey={(o) => o.name}
      getSearchText={(o) => o.name}
      onSelect={onSelect}
      renderRow={(o, selected) => (
        <Text>
          <Text color={selected ? "cyan" : undefined}>{selected ? "❯ " : "  "}</Text>
          <Text bold={selected}>{o.name.padEnd(nameWidth)}</Text>
          {"  "}
          <Text dimColor>{displayPath(o.file, root)}</Text>
        </Text>
      )}
    />
  );
}
