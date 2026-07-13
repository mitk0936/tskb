import { createInterface } from "node:readline/promises";
import { action } from "../core/action.ts";

/** A selectable option: a bare string (its own value), or a labelled value. */
export type PromptChoice = string | { label: string; value: string };

interface PromptCommon {
  /** Question shown to the user. Defaults per kind ("Input:" / "Choose:"). */
  message?: string;
  /** Use the default and stop waiting after this many ms (≤0/non-finite = forever). Default 30000. */
  timeoutMs?: number;
}

export interface InputPromptOptions extends PromptCommon {
  kind?: "input";
  /** Value used on an empty answer or timeout. Default "". */
  default?: string;
}

export interface ChoicePromptOptions extends PromptCommon {
  kind: "choice";
  choices: PromptChoice[];
  /** Default selection — a choice value or a 1-based index. Default: the first choice. */
  default?: string | number;
}

export type PromptOptions = InputPromptOptions | ChoicePromptOptions;

/** How a prompt's answer was decided. */
export type PromptVia = "input" | "default" | "timeout";

export interface PromptEvents {
  prompt: string;
  answer: { value: string; via: PromptVia };
}

const asChoices = (choices: PromptChoice[]): { label: string; value: string }[] =>
  choices.map((c) => (typeof c === "string" ? { label: c, value: c } : c));

/**
 * Asks the terminal a question — free-text **input** or a **choice** — and resolves
 * with the answer, which it also attaches as the handle (`prompt(...).ref` feeds
 * another action). A timeout (default 30s) falls back to the default so an
 * unattended run never blocks; teardown also unblocks a pending prompt.
 */
export const prompt = action("prompt")
  .emits<PromptEvents>()
  .ref<string>()
  .run(async ({ signal, emit, attach }, opts: PromptOptions = {}): Promise<string> => {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const finite = Number.isFinite(timeoutMs) && timeoutMs > 0;

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
      resolveRaw = (raw): string | undefined => {
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 1 && n <= choices.length) return choices[n - 1].value;
        return choices.find((c) => c.value === raw || c.label === raw)?.value;
      };
    } else {
      defaultValue = opts.default ?? "";
      message = opts.message ?? "Input:";
      query = defaultValue ? `${message} (${defaultValue}) ` : `${message} `;
      resolveRaw = (raw): string | undefined => raw;
    }

    emit("prompt", message);

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
          console.log(`invalid answer "${raw}", using default`);
          via = "default";
        }
      }
    } catch {
      via = onTimeout.signal.aborted ? "timeout" : "default";
    } finally {
      if (timer) clearTimeout(timer);
      rl.close();
    }

    console.log(via === "timeout" ? `timed out → ${value}` : `${value} (${via})`);
    attach(value); // resolves instance.ref → the answer
    emit("answer", { value, via });
    return value;
  });
