import { useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { SearchableList } from "./SearchableList.tsx";
import type { RunSummary } from "../../../output/RunModel.ts";
import type { PromptRequest, Verdict } from "../../../client/types.ts";

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

/** One-line roll-up of the live tree: what's still running and the finished tally. Empty until
 *  something is happening, so it renders nothing at the very start of a run. */
function statusStrip(s: RunSummary): string {
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

/** The live run surface: milestone lines, a compact status strip, a pending prompt, and the verdict. */
export function RunView({
  lines,
  status,
  prompt,
  verdict,
  onAnswer,
}: {
  lines: readonly string[];
  status?: RunSummary;
  prompt?: PromptRequest;
  verdict?: Verdict;
  onAnswer: (value: string) => void;
}): ReactElement {
  const strip = status && !verdict ? statusStrip(status) : "";
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      {strip ? <Text dimColor>{strip}</Text> : null}
      {prompt ? <PromptView request={prompt} onAnswer={onAnswer} /> : null}
      {verdict ? (
        <Text color={verdict.ok ? "green" : "red"}>
          {verdict.ok ? "✓ ok" : "✗ failed"} · {verdict.folder}
        </Text>
      ) : null}
    </Box>
  );
}
