import { useEffect, useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { SearchableList } from "./SearchableList.tsx";
import { Spinner } from "../Spinner.tsx";
import type { RunNode, RunSummary } from "../../../output/RunModel.ts";
import type { PromptRequest } from "../../../client/types.ts";

/** A choice prompt: searchable, arrow-navigable options, Enter picks the highlighted one. */
function ChoicePrompt({
  request,
  onAnswer,
}: {
  request: PromptRequest;
  onAnswer: (value: string) => void;
}): ReactElement {
  const { spec } = request;
  const choices = spec.choices ?? [];
  const defaultIndex = Math.max(
    0,
    choices.findIndex((c) => c.value === spec.default)
  );

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{spec.message}</Text>
      <SearchableList
        items={choices}
        getKey={(c) => c.value}
        getSearchText={(c) => c.label}
        initialIndex={defaultIndex}
        onSelect={(c) => onAnswer(c.value)}
        renderRow={(c, selected) => (
          <Text inverse={selected}>
            {c.value === spec.default ? "* " : "  "}
            {c.label}
          </Text>
        )}
      />
    </Box>
  );
}

/** A free-text prompt: a bordered field with a block cursor and a dim default/enter hint. */
function InputPrompt({
  request,
  onAnswer,
}: {
  request: PromptRequest;
  onAnswer: (value: string) => void;
}): ReactElement {
  const { spec } = request;
  // Ref holds the authoritative text: Ink can deliver several key events before React re-renders,
  // so the Enter handler must read a ref, not a possibly-stale render closure.
  const textRef = useRef("");
  const [text, setText] = useState("");

  useInput((input, key) => {
    if (key.return) {
      onAnswer(textRef.current === "" ? spec.default : textRef.current);
    } else if (key.backspace || key.delete) {
      textRef.current = textRef.current.slice(0, -1);
      setText(textRef.current);
    } else if (input && !key.ctrl && !key.meta) {
      textRef.current += input;
      setText(textRef.current);
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{spec.message}</Text>
      <Text>
        {"› "}
        {text}
        <Text inverse> </Text>
      </Text>
      <Text dimColor>enter ⏎{spec.default ? ` · default: ${spec.default}` : ""}</Text>
    </Box>
  );
}

/** Answer one pending prompt — free-text input, or searchable choices. */
export function PromptView({
  request,
  onAnswer,
}: {
  request: PromptRequest;
  onAnswer: (value: string) => void;
}): ReactElement {
  return request.spec.kind === "choice" ? (
    <ChoicePrompt request={request} onAnswer={onAnswer} />
  ) : (
    <InputPrompt request={request} onAnswer={onAnswer} />
  );
}

/** Where a run is: its body still going, its body returned with daemons left up, or tearing down. */
export type RunPhase = "running" | "up" | "stopping";

/** Rows of the live tree before the rest collapse into `+N running` — so the box never jumps. */
export const MAX_TREE_ROWS = 6;

/** `850ms`, `8.3s`, `3m12s`, `1h04m`. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const s = Math.floor(ms / 1000);
  if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(s / 3600)}h${String(Math.floor(s / 60) % 60).padStart(2, "0")}m`;
}

/** Longest node name the tree shows before cutting out its middle. */
const NAME_MAX = 40;

/**
 * A node's name in the tree, with its tags — `vite [ready]`. The log stream carries only the
 * node's path segment, the action name made file-safe plus the node's id (`tailLog_bbe803dc`),
 * so the id is dropped and an over-long name (a `command`'s whole command line) keeps its two
 * ends — the tag beside it is usually what tells the rows apart.
 */
export function nodeLabel(node: Pick<RunNode, "path" | "tags">): string {
  const segment = node.path.slice(node.path.lastIndexOf("/") + 1).replace(/_[0-9a-f]{8}$/, "");
  const name =
    segment.length > NAME_MAX
      ? `${segment.slice(0, NAME_MAX / 2 - 1)}…${segment.slice(-(NAME_MAX / 2))}`
      : segment;
  return node.tags.length ? `${name} [${node.tags.join(", ")}]` : name;
}

/**
 * The time since `since`. Read at render, so every redraw shows it current; the tick only forces
 * one when nothing else does (an idle stack that is up). Unref'd, like {@link Spinner}'s
 * interval, so it never holds the process open.
 */
function Elapsed({ since }: { since: number }): ReactElement {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    id.unref?.();
    return () => clearInterval(id);
  }, []);
  return <>{formatDuration(Date.now() - since)}</>;
}

/** One-line roll-up of the live tree: what's still running and the finished tally. Empty until
 *  something is happening, so it renders nothing at the very start of a run. */
export function statusStrip(s: RunSummary): string {
  const parts: string[] = [];
  if (s.running.length) {
    const shown = s.running.slice(0, 3).join(", ");
    const more = s.running.length > 3 ? ` +${s.running.length - 3}` : "";
    parts.push(`● running: ${shown}${more}`);
  }
  const tally: string[] = [];
  if (s.ok) tally.push(`${s.ok} ok`);
  if (s.failed) tally.push(`${s.failed} failed`);
  if (s.cancelled) tally.push(`${s.cancelled} cancelled`);
  if (tally.length) parts.push(tally.join(" · "));
  return parts.join("  ·  ");
}

/**
 * The running nodes under the root, most recently active first — the order {@link RunSummary}
 * keeps — so whatever is talking right now stays on screen when the rest collapse.
 */
function liveNodes(nodes: readonly RunNode[], summary: RunSummary | undefined): RunNode[] {
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  const order = summary?.running ?? nodes.filter((n) => n.status === "running").map((n) => n.path);
  return order
    .map((p) => byPath.get(p))
    .filter((n): n is RunNode => n !== undefined && n.path.includes("/"));
}

function Header({
  name,
  phase,
  startedAt,
  upAt,
}: {
  name: string;
  phase: RunPhase;
  startedAt: number;
  upAt?: number;
}): ReactElement {
  return (
    <Text>
      <Text bold>{name}</Text>
      <Text dimColor>{" · "}</Text>
      {phase === "stopping" ? (
        <Text color="yellow">stopping…</Text>
      ) : phase === "up" ? (
        <Text color="green">
          ● up <Elapsed since={upAt ?? startedAt} />
        </Text>
      ) : (
        <Text color="cyan">
          running <Elapsed since={startedAt} />
        </Text>
      )}
    </Text>
  );
}

/**
 * The live run box — the only part of the screen redrawn while a run streams (its milestones go
 * to the scrollback above it): a header with the phase and elapsed time, the running nodes with
 * their latest line, the finished tally, and a pending prompt, which takes the box over.
 */
export function RunView({
  name,
  phase,
  startedAt,
  upAt,
  nodes,
  summary,
  prompt,
  onAnswer,
}: {
  name: string;
  phase: RunPhase;
  startedAt: number;
  /** When the run's body returned (the `up` event), for the "up for" clock. */
  upAt?: number;
  nodes: readonly RunNode[];
  summary?: RunSummary;
  prompt?: PromptRequest;
  onAnswer: (value: string) => void;
}): ReactElement {
  const { stdout } = useStdout();
  const width = Math.max(30, (stdout?.columns || 100) - 4);
  const live = liveNodes(nodes, summary);
  const shown = live.slice(0, MAX_TREE_ROWS);
  const root = nodes.find((n) => !n.path.includes("/"));
  const now = Date.now();
  const stopping = phase === "stopping";
  const strip = summary ? statusStrip(summary) : "";
  const tally = summary
    ? [
        summary.ok ? `✓ ${summary.ok} ok` : "",
        summary.failed ? `✗ ${summary.failed} failed` : "",
        summary.cancelled ? `⊘ ${summary.cancelled} cancelled` : "",
      ].filter(Boolean)
    : [];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={stopping ? "yellow" : phase === "up" ? "green" : "gray"}
      paddingX={1}
    >
      <Header name={name} phase={phase} startedAt={startedAt} upAt={upAt} />
      {prompt ? (
        <>
          {strip ? <Text dimColor>{strip}</Text> : null}
          <PromptView request={prompt} onAnswer={onAnswer} />
        </>
      ) : (
        <>
          {shown.map((n) => (
            <Box key={n.path} flexDirection="column">
              <Text wrap="truncate-end">
                {stopping ? <Text color="yellow">◌ </Text> : <Text color="cyan">● </Text>}
                {nodeLabel(n)}
                <Text dimColor>{`  ${formatDuration(now - n.startedAt)}`}</Text>
              </Text>
              {n.last ? (
                <Text dimColor wrap="truncate-end">
                  {`  └ ${n.last.slice(0, width)}`}
                </Text>
              ) : null}
            </Box>
          ))}
          {live.length > shown.length ? (
            <Text dimColor>{`  +${live.length - shown.length} more running`}</Text>
          ) : null}
          {live.length === 0 && !stopping ? (
            // nothing launched under the root (yet): what the om's own body last said, if anything
            root?.last ? (
              <Text dimColor wrap="truncate-end">{`└ ${root.last.slice(0, width)}`}</Text>
            ) : (
              <Spinner label={phase === "up" ? "idle" : "starting…"} />
            )
          ) : null}
          {tally.length ? <Text dimColor>{tally.join(" · ")}</Text> : null}
        </>
      )}
    </Box>
  );
}
