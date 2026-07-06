import { createInterface } from "node:readline/promises";
import { action } from "../orchestration/action/action.ts";

/** A selectable option: a bare string (its own value), or a labelled value. */
export type PromptChoice = string | { label: string; value: string };

interface PromptCommon {
  /** Question shown to the user. Defaults per kind ("Input:" / "Choose:"). */
  message?: string;
  /**
   * Use the default and stop waiting after this many ms. A non-finite or
   * non-positive value waits indefinitely (until answered or teardown).
   * Default 30000.
   */
  timeoutMs?: number;
}

export interface InputPromptOptions extends PromptCommon {
  kind?: "input";
  /** Value used on an empty answer or timeout. Default "". */
  default?: string;
}

export interface ChoicePromptOptions extends PromptCommon {
  kind: "choice";
  /** The options to choose from (entered by number, value, or label). */
  choices: PromptChoice[];
  /** Default selection — a choice value or a 1-based index. Default: the first choice. */
  default?: string | number;
}

export type PromptOptions = InputPromptOptions | ChoicePromptOptions;

/** How a prompt's answer was decided. */
export type PromptVia = "input" | "default" | "timeout";

export interface PromptEvents {
  /** The prompt was shown; payload is the question message. */
  prompt: string;
  /** An answer settled; payload is the value and how it was decided. */
  answer: { value: string; via: PromptVia };
}

/** Normalize choices to `{ label, value }`. */
const asChoices = (choices: PromptChoice[]): { label: string; value: string }[] =>
  choices.map((c) => (typeof c === "string" ? { label: c, value: c } : c));

/**
 * Asks the terminal a question — free-text **input** or a **choice** from a list —
 * and resolves with the answer, which it also publishes as the action's handle
 * (so `prompt(...).ref` feeds straight into another action). Everything is
 * defaulted: a bare `prompt()` is a free-text input with no default and a 30s
 * timeout.
 *
 * A configurable timeout (default 30s; non-finite/≤0 waits forever) falls back to
 * the default value, so an unattended run never blocks. The run's abort signal
 * also unblocks a pending prompt on teardown. Emits `prompt` when shown and
 * `answer` when settled (carrying whether it came from input, the default, or a
 * timeout).
 */
export const prompt = action("Prompt")
  .emits<PromptEvents>()
  .ref<string>()
  .run(async ({ logs, signal, emit, attach }, opts: PromptOptions = {}): Promise<string> => {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const finite = Number.isFinite(timeoutMs) && timeoutMs > 0;

    // Build the question, the fallback value, and a resolver from raw input.
    let message: string;
    let query: string;
    let defaultValue: string;
    let resolveRaw: (raw: string) => string | undefined;

    if (opts.kind === "choice") {
      const choices = asChoices(opts.choices);
      const { default: def } = opts;
      const picked =
        typeof def === "number"
          ? choices[def - 1]
          : def !== undefined
            ? choices.find((c) => c.value === def)
            : undefined;
      defaultValue = (picked ?? choices[0])?.value ?? "";
      message = opts.message ?? "Choose:";
      const list = choices
        .map((c, i) => `  ${i + 1}) ${c.label}${c.value === defaultValue ? " (default)" : ""}`)
        .join("\n");
      query = `${message}\n${list}\n> `;
      // Accept a 1-based index, an exact value, or an exact label.
      resolveRaw = (raw) => {
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
        return choices.find((c) => c.value === raw || c.label === raw)?.value;
      };
    } else {
      defaultValue = opts.default ?? "";
      message = opts.message ?? "Input:";
      query = defaultValue ? `${message} (${defaultValue}) ` : `${message} `;
      resolveRaw = (raw) => raw; // any non-empty input is the value
    }

    emit("prompt", message);

    // A dedicated controller for the timeout, so it's distinguishable from a
    // teardown abort; either one cancels the pending question.
    const onTimeout = new AbortController();
    const timer = finite ? setTimeout(() => onTimeout.abort(), timeoutMs) : undefined;
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    let value = defaultValue;
    let via: PromptVia = "default";
    try {
      const raw = (
        await rl.question(query, { signal: AbortSignal.any([signal, onTimeout.signal]) })
      ).trim();
      if (raw === "") {
        via = "default";
      } else {
        const resolved = resolveRaw(raw);
        if (resolved !== undefined) {
          value = resolved;
          via = "input";
        } else {
          logs.append({
            source: "Prompt",
            level: "info",
            message: `invalid answer "${raw}", using default`,
          });
          via = "default";
        }
      }
    } catch {
      // Aborted before an answer: the timeout (use default + note it) or teardown.
      via = onTimeout.signal.aborted ? "timeout" : "default";
    } finally {
      if (timer) clearTimeout(timer);
      rl.close();
    }

    logs.append({
      source: "Prompt",
      level: "info",
      message: via === "timeout" ? `timed out → ${value}` : `${value} (${via})`,
    });
    attach(value); // resolves instance.ref → the answer
    emit("answer", { value, via });
    return value;
  });
