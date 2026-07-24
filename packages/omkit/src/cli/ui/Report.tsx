import { type ReactElement } from "react";
import { Box, Text, render, useStdout } from "ink";
import { Spinner } from "./Spinner.tsx";

export type ReportKind = "error" | "warning" | "ok" | "info";

/** One row of a report: a colored `head` (e.g. a file:line location) and a dim `detail`. */
export interface ReportItem {
  head: string;
  detail?: string;
}

export interface ReportProps {
  kind: ReportKind;
  /** The bold, colored headline (e.g. "3 type errors"). */
  title: string;
  /** A dim line under the title — e.g. the config file a diagnostic came from. */
  subtitle?: string;
  /** The list of findings, shown under a separator. */
  items?: ReportItem[];
  /** A dim footer with next-step guidance. */
  hint?: string;
}

const THEME: Record<ReportKind, { color: string; icon: string }> = {
  error: { color: "red", icon: "✗" },
  warning: { color: "yellow", icon: "⚠" },
  ok: { color: "green", icon: "✓" },
  info: { color: "cyan", icon: "ℹ" },
};

/** A horizontal rule sized to the terminal (bounded), used to separate the header from the list. */
function Divider({ color }: { color: string }): ReactElement {
  const { stdout } = useStdout();
  const width = Math.max(Math.min((stdout?.columns ?? 80) - 6, 56), 12);
  return (
    <Text color={color} dimColor>
      {"─".repeat(width)}
    </Text>
  );
}

/**
 * A colorful, bordered diagnostics panel: an icon + title header, an optional subtitle, a separator,
 * a list of items (colored location + dim detail), and an optional dim hint footer. Kind picks the
 * accent color (error red / warning yellow / ok green / info cyan).
 */
export function Report({ kind, title, subtitle, items = [], hint }: ReportProps): ReactElement {
  const { color, icon } = THEME[kind];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      <Text color={color} bold>
        {icon} {title}
      </Text>
      {subtitle ? <Text dimColor>{subtitle}</Text> : null}
      {items.length > 0 ? (
        <>
          <Divider color={color} />
          {items.map((it, i) => (
            <Text key={i}>
              {it.head ? <Text color={color}>{it.head}</Text> : null}
              {it.detail ? <Text dimColor>{(it.head ? "  " : "") + it.detail}</Text> : null}
            </Text>
          ))}
        </>
      ) : null}
      {hint ? (
        <Box marginTop={1}>
          <Text dimColor>{hint}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

/**
 * Render a one-shot Ink element to `stream` (stderr by default) and resolve once it's painted.
 * Paints a single frame then unmounts, leaving it in the scrollback — the right shape for
 * non-interactive diagnostic output, unlike the live app.
 */
export async function renderReport(
  element: ReactElement,
  stream: NodeJS.WriteStream = process.stderr
): Promise<void> {
  const app = render(element, { stdout: stream, patchConsole: false });
  await new Promise((resolve) => setImmediate(resolve)); // let the frame paint once
  app.unmount();
  await app.waitUntilExit();
}

/** Build a {@link Report} from plain data and render it — so non-JSX call sites (the bin, run.ts)
 *  stay free of JSX while still using the Ink component. */
export function renderDiagnostics(
  props: ReportProps,
  stream: NodeJS.WriteStream = process.stderr
): Promise<void> {
  return renderReport(<Report {...props} />, stream);
}

/**
 * Show a spinner labelled `label` while `work` runs, then clear it and resolve `work`'s result.
 * Good for the noticeable-but-quiet waits (discovery, typecheck). Note: a CPU-bound synchronous
 * `work` blocks the event loop, so the spinner shows its label but can't animate until `work`
 * yields — it still tells the user something is happening instead of a silent hang.
 */
export async function withSpinner<T>(
  label: string,
  work: () => T | Promise<T>,
  stream: NodeJS.WriteStream = process.stderr
): Promise<T> {
  // No TTY (piped/CI) → a spinner can't animate or erase itself; skip it and just do the work,
  // so the output stays clean rather than leaving a stray "…" line above the result.
  if (!stream.isTTY) return work();
  const app = render(<Spinner label={label} />, { stdout: stream, patchConsole: false });
  try {
    await new Promise((resolve) => setImmediate(resolve)); // let the first frame paint
    return await work();
  } finally {
    app.clear(); // erase the spinner frame (unmount alone leaves the last frame on screen)
    app.unmount();
    await app.waitUntilExit();
  }
}
