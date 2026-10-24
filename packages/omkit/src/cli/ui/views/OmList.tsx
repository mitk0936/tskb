import path from "node:path";
import { useMemo, type ReactElement } from "react";
import { Box, Text, useStdout } from "ink";
import { SearchableList } from "./SearchableList.tsx";
import { byNesting } from "../../../client/order.ts";
import type { DiscoveredOm } from "../../../client/registry.ts";

/** Show the om's path relative to `root` when it's inside it; else the absolute path. */
function displayPath(file: string, root: string): string {
  const rel = path.relative(root, file);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel : file;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

/**
 * The picker: a searchable, arrow-navigable list of oms; Enter runs the highlighted one.
 *
 * Each row is the om's name and its summary (or, without one, its path); the search matches
 * both. Under the list, the highlighted om in full: its summary, where it is defined, and the
 * actions its body calls with their tags — the same outline the skill file shows.
 *
 * Rows are ordered by {@link byNesting} from the working directory — the same root the paths
 * are rendered from, so the oms nearest the top of the project come first, deeper ones after,
 * and any shown as an absolute path last.
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
  const { stdout } = useStdout();
  const columns = stdout?.columns || 100;

  // Column width so summaries line up; capped so one long name can't push them off-screen.
  const nameWidth = Math.min(
    30,
    oms.reduce((w, o) => Math.max(w, o.name.length), 0)
  );
  const restWidth = Math.max(20, columns - nameWidth - 6);

  return (
    <Box flexDirection="column">
      <Text>
        <Text bold>omkit</Text>
        <Text dimColor>{` · ${oms.length} om${oms.length === 1 ? "" : "s"}`}</Text>
      </Text>
      <SearchableList
        items={sorted}
        getKey={(o) => `${o.file}\0${o.name}`}
        getSearchText={(o) => `${o.name} ${o.summary ?? ""}`}
        onSelect={onSelect}
        alwaysShowSearch
        searchLabel="search › "
        searchPlaceholder="type to filter by name or summary"
        renderRow={(o, selected) => (
          <Text wrap="truncate-end">
            <Text color={selected ? "cyan" : undefined}>{selected ? "❯ " : "  "}</Text>
            <Text bold={selected} color={selected ? "cyan" : undefined}>
              {o.name.padEnd(nameWidth)}
            </Text>
            {"  "}
            <Text dimColor>{truncate(o.summary ?? displayPath(o.file, root), restWidth)}</Text>
          </Text>
        )}
        renderDetail={(o) => (o ? <OmDetail om={o} root={root} /> : null)}
      />
      <Text dimColor>↑↓ move · enter run · esc clears search · ctrl+c quit</Text>
    </Box>
  );
}

/** The highlighted om in full. */
function OmDetail({ om, root }: { om: DiscoveredOm; root: string }): ReactElement {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text bold color="cyan">
        {om.name}
      </Text>
      {om.summary ? (
        <Text>{om.summary}</Text>
      ) : (
        <Text dimColor italic>
          No summary. Add .describe({"{ summary }"}) to the om.
        </Text>
      )}
      <Text dimColor>{`${displayPath(om.file, root)}:${om.line}`}</Text>
      {om.calls?.length ? (
        <Text wrap="wrap">
          <Text dimColor>calls </Text>
          {om.calls.map((c, i) => (
            <Text key={`${c.name}\0${c.tag ?? ""}`}>
              {i > 0 ? <Text dimColor> → </Text> : null}
              {c.name}
              {c.tag ? <Text dimColor>{` [${c.tag}]`}</Text> : null}
            </Text>
          ))}
        </Text>
      ) : null}
    </Box>
  );
}
