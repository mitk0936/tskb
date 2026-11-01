import { memo, type ReactElement } from "react";
import { Box, Static, Text, useStdout } from "ink";

/** One line of scrollback, with an optional accent. */
export interface ScrollLine {
  readonly text: string;
  readonly color?: string;
  readonly dim?: boolean;
  readonly bold?: boolean;
  /**
   * Draw the line as a rule across the terminal, `text` set into it and `right` (if any) at its
   * end — `── tskb:build ──────── 14:21:17`. What opens each run, so runs read as sections.
   */
  readonly rule?: { readonly right?: string };
}

/**
 * A batch of lines appended to the scrollback at once — one per redraw tick, not one per line,
 * so the item array {@link Scrollback} hands `<Static>` grows with ticks rather than with output.
 */
export interface ScrollChunk {
  readonly id: number;
  readonly lines: readonly ScrollLine[];
}

/** Widest a rule runs, so it stays a separator on a very wide terminal rather than a horizon. */
const RULE_MAX = 100;

function Rule({ line, columns }: { line: ScrollLine; columns: number }): ReactElement {
  const right = line.rule?.right ? ` ${line.rule.right}` : "";
  const width = Math.min(columns, RULE_MAX);
  const fill = Math.max(3, width - 3 - line.text.length - 1 - right.length);
  return (
    <Text>
      <Text dimColor>{"── "}</Text>
      <Text bold={line.bold} color={line.color}>
        {line.text}
      </Text>
      <Text dimColor>{` ${"─".repeat(fill)}${right}`}</Text>
    </Text>
  );
}

/**
 * Everything the session has said, written once into the terminal's own scrollback by Ink's
 * `<Static>` and never redrawn: run headers, outcomes, verdicts and their recap. That is what
 * keeps the live frame below it small — a frame costs in proportion to what it draws.
 */
export const Scrollback = memo(function Scrollback({
  chunks,
}: {
  chunks: readonly ScrollChunk[];
}): ReactElement {
  const { stdout } = useStdout();
  const columns = stdout?.columns || 80;
  return (
    <Static items={chunks as ScrollChunk[]}>
      {(chunk) => (
        <Box key={chunk.id} flexDirection="column">
          {chunk.lines.map((l, i) =>
            l.rule ? (
              <Rule key={i} line={l} columns={columns} />
            ) : (
              <Text key={i} color={l.color} dimColor={l.dim} bold={l.bold}>
                {l.text}
              </Text>
            )
          )}
        </Box>
      )}
    </Static>
  );
});
