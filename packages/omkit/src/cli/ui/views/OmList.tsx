import path from "node:path";
import { useMemo, type ReactElement, type ReactNode } from "react";
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
 *
 * `status` goes on the header line (the shell's "rediscovering…"), and `hint` replaces the key
 * line under the list, for a caller that binds more keys than the list does.
 */
export function OmList({
  oms,
  onSelect,
  status,
  hint = "↑↓ move · enter run · esc clears search · ctrl+c quit",
}: {
  oms: DiscoveredOm[];
  onSelect: (om: DiscoveredOm) => void;
  status?: ReactNode;
  hint?: string;
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
        {status ? <Text dimColor>{"  "}</Text> : null}
        {status ?? null}
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
      <Text dimColor>{hint}</Text>
    </Box>
  );
}

/** Steps listed before the rest collapse into `+N more`, so the box keeps a steady height. */
const MAX_STEPS = 10;

/** A description key as a label: `docsUrl` / `docs-url` / `docs_url` → `Docs url`. */
export function labelOf(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One label/value row; the value wraps under itself, not under the label. */
function Field({
  label,
  width,
  children,
}: {
  label: string;
  width: number;
  children: ReactNode;
}): ReactElement {
  return (
    <Box>
      <Box width={width + 2} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      <Box flexGrow={1}>{children}</Box>
    </Box>
  );
}

/**
 * The highlighted om in full: its name, then a field per thing it says about itself — the
 * summary, any further `.describe(…)` props, where it is defined — then its steps, numbered.
 * The steps are the static outline, an approximation (see `outlineBody`), and say so.
 */
function OmDetail({ om, root }: { om: DiscoveredOm; root: string }): ReactElement {
  const details = (om.details ?? []).map((d) => ({ label: labelOf(d.key), value: d.value }));
  const width = Math.max("Summary".length, "Defined".length, ...details.map((d) => d.label.length));
  const steps = om.calls ?? [];
  const shown = steps.slice(0, MAX_STEPS);
  const stepWidth = Math.min(24, Math.max(0, ...shown.map((c) => c.name.length)));
  const numWidth = String(shown.length).length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginTop={1}>
      <Text bold color="cyan">
        {om.name}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Field label="Summary" width={width}>
          {om.summary ? (
            <Text wrap="wrap">{om.summary}</Text>
          ) : (
            <Text dimColor italic>
              none · add .describe({"{ summary }"}) to the om
            </Text>
          )}
        </Field>
        {details.map((d) => (
          <Field key={d.label} label={d.label} width={width}>
            <Text wrap="wrap">{d.value}</Text>
          </Field>
        ))}
        <Field label="Defined" width={width}>
          <Text dimColor wrap="truncate-start">{`${displayPath(om.file, root)}:${om.line}`}</Text>
        </Field>
      </Box>
      {shown.length ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text dimColor>Steps</Text>
            <Text dimColor italic>
              {"  read from source · approximate"}
            </Text>
          </Text>
          {shown.map((c, i) => (
            <Text key={`${c.name}\0${c.tag ?? ""}`} wrap="truncate-end">
              <Text dimColor>{`  ${String(i + 1).padStart(numWidth)}  `}</Text>
              {c.tag ? c.name.padEnd(stepWidth) : c.name}
              {c.tag ? <Text color="cyan">{`  ${c.tag}`}</Text> : null}
            </Text>
          ))}
          {steps.length > shown.length ? (
            <Text
              dimColor
            >{`  ${" ".repeat(numWidth)}  +${steps.length - shown.length} more`}</Text>
          ) : null}
        </Box>
      ) : null}
    </Box>
  );
}
