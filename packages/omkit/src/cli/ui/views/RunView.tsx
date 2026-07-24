import { useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput } from "ink";
import { SearchableList } from "./SearchableList.tsx";
import type { PromptRequest, Verdict } from "../../client/types.ts";

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

/** The live run surface: milestone lines, a pending prompt, and the final verdict. */
export function RunView({
  lines,
  prompt,
  verdict,
  onAnswer,
}: {
  lines: string[];
  prompt?: PromptRequest;
  verdict?: Verdict;
  onAnswer: (value: string) => void;
}): ReactElement {
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i}>{line}</Text>
      ))}
      {prompt ? <PromptView request={prompt} onAnswer={onAnswer} /> : null}
      {verdict ? (
        <Text color={verdict.ok ? "green" : "red"}>
          {verdict.ok ? "✓ ok" : "✗ failed"} · {verdict.folder}
        </Text>
      ) : null}
    </Box>
  );
}
