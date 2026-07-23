import { useRef, useState, type ReactElement } from "react";
import { Box, Text, useInput, type Key } from "ink";
import type { PromptRequest, Verdict } from "../../client/types.ts";

/** Answer one pending prompt — free-text input, or arrow-navigable choices. */
export function PromptView({
  request,
  onAnswer,
}: {
  request: PromptRequest;
  onAnswer: (value: string) => void;
}): ReactElement {
  const { spec } = request;
  const choices = spec.choices ?? [];
  // Refs hold the authoritative value: Ink can deliver several key events before React
  // re-renders, so the Enter handler must read a ref, not a possibly-stale render closure.
  // State mirrors the ref only to drive the display.
  const textRef = useRef("");
  const indexRef = useRef(0);
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);

  const onChoiceKey = (key: Key): void => {
    if (key.upArrow) {
      indexRef.current = Math.max(0, indexRef.current - 1);
      setIndex(indexRef.current);
    } else if (key.downArrow) {
      indexRef.current = Math.min(choices.length - 1, indexRef.current + 1);
      setIndex(indexRef.current);
    } else if (key.return) {
      onAnswer(choices[indexRef.current]?.value ?? spec.default);
    }
  };

  const onInputKey = (input: string, key: Key): void => {
    if (key.return) {
      onAnswer(textRef.current === "" ? spec.default : textRef.current);
    } else if (key.backspace || key.delete) {
      textRef.current = textRef.current.slice(0, -1);
      setText(textRef.current);
    } else if (input && !key.ctrl && !key.meta) {
      textRef.current += input;
      setText(textRef.current);
    }
  };

  useInput((input, key) => (spec.kind === "choice" ? onChoiceKey(key) : onInputKey(input, key)));

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text>{spec.message}</Text>
      {spec.kind === "choice" ? (
        choices.map((c, i) => (
          <Text key={c.value} inverse={i === index}>
            {c.value === spec.default ? "* " : "  "}
            {c.label}
          </Text>
        ))
      ) : (
        <Text>
          {"> "}
          {text}
        </Text>
      )}
    </Box>
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
