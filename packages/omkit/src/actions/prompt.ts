import { createInterface } from "node:readline/promises";
import { action } from "../core/action.ts";
import { activeSupervisor, type PromptSpec, type Supervisor } from "../core/interaction.ts";

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

/** How a multiline prompt decides the user is done. */
export type MultilineUntil = "json" | string | ((text: string) => boolean);

export interface MultilinePromptOptions extends PromptCommon {
  kind: "multiline";
  /** A one-line type sketch printed under the message. */
  hint?: string;
  /** Default `"json"` — stop once the text parses as JSON. */
  until?: MultilineUntil;
  /** Value used on EOF with no input, or on timeout. Default "". */
  default?: string;
}

export type PromptOptions = InputPromptOptions | ChoicePromptOptions | MultilinePromptOptions;

/** Reads one line, or `undefined` at EOF. */
export type LineReader = () => Promise<string | undefined>;

/**
 * Accumulate lines until `until` says stop, or EOF. Exported for testing: keeping the
 * termination rule separate from the terminal means it can be driven by a scripted
 * reader instead of a TTY.
 *
 * `"json"` is self-terminating — pasting a pretty-printed blob just works, with no
 * sentinel to explain. A sentinel line is excluded from the result.
 *
 * Note there is deliberately no Ctrl-D/EOF-by-keystroke terminator: readline treats it as
 * a close, and `prompt` builds and tears down an interface per call, so it risks leaving
 * stdin unusable for later prompts in the same run.
 */
export async function readUntil(read: LineReader, until: MultilineUntil): Promise<string> {
  const lines: string[] = [];
  for (;;) {
    const line = await read();
    if (line === undefined) break; // EOF
    if (typeof until === "string" && until !== "json" && line === until) break;
    lines.push(line);
    const text = lines.join("\n");
    if (until === "json" && parses(text)) break;
    if (typeof until === "function" && until(text)) break;
  }
  return lines.join("\n");
}

function parses(text: string): boolean {
  if (text.trim() === "") return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/** How a prompt's answer was decided. */
export type PromptVia = "input" | "default" | "timeout";

export interface PromptEvents {
  prompt: string;
  answer: { value: string; via: PromptVia };
}

const asChoices = (choices: PromptChoice[]): { label: string; value: string }[] =>
  choices.map((c) => (typeof c === "string" ? { label: c, value: c } : c));

/** A settled answer: the resolved value and how it was decided. */
interface Answer {
  value: string;
  via: PromptVia;
}

/** Route the request over the supervisor channel, resolving the raw answer against the choices. */
async function askSupervisor(
  supervisor: Supervisor,
  ctx: {
    opts: PromptOptions;
    message: string;
    defaultValue: string;
    resolveRaw: (raw: string) => string | undefined;
  },
  waitSignal: AbortSignal
): Promise<Answer> {
  const { opts, message, defaultValue, resolveRaw } = ctx;
  const spec: PromptSpec = {
    kind: opts.kind === "choice" ? "choice" : opts.kind === "multiline" ? "multiline" : "input",
    message,
    default: defaultValue,
    ...(opts.kind === "choice" ? { choices: asChoices(opts.choices) } : {}),
    ...(opts.kind === "multiline" && opts.hint ? { hint: opts.hint } : {}),
  };
  const answer = await supervisor.request(spec, waitSignal);
  const resolved = resolveRaw(answer.value);
  if (resolved === undefined) return { value: defaultValue, via: "default" };
  return { value: resolved, via: (answer.via as PromptVia) ?? "input" };
}

/** Read the answer straight from the terminal (the bare, unsupervised path). */
async function askTerminal(
  query: string,
  resolveRaw: (raw: string) => string | undefined,
  defaultValue: string,
  waitSignal: AbortSignal,
  multiline?: { until: MultilineUntil }
): Promise<Answer> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    if (multiline) {
      process.stdout.write(query);
      const read: LineReader = async () => {
        try {
          return await rl.question("", { signal: waitSignal });
        } catch (err) {
          // Giving up (prompt timeout or run teardown) is not end-of-input. Propagate it so the
          // action's outer catch labels the answer `timeout` and falls back to the default, the
          // same as the `input` and `choice` kinds — half a JSON blob is not a useful answer.
          // Only a rejection with the signal still unaborted is genuine EOF (the stream closed).
          if (waitSignal.aborted) throw err;
          return undefined;
        }
      };
      const text = await readUntil(read, multiline.until);
      if (text.trim() === "") return { value: defaultValue, via: "default" };
      return { value: text, via: "input" };
    }
    const raw = (await rl.question(query, { signal: waitSignal })).trim();
    if (raw === "") return { value: defaultValue, via: "default" };
    const resolved = resolveRaw(raw);
    if (resolved !== undefined) return { value: resolved, via: "input" };
    console.log(`invalid answer "${raw}", using default`);
    return { value: defaultValue, via: "default" };
  } finally {
    rl.close();
  }
}

/**
 * Asks the terminal a question — free-text **input**, a **choice**, or a **multiline**
 * block (see {@link readUntil} for how it ends) — and resolves with the answer, which it
 * also attaches as the handle (`prompt(...).ref` feeds another action). A timeout
 * (default 30s) falls back to the default so an unattended run never blocks; teardown
 * also unblocks a pending prompt.
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

    if (opts.kind === "multiline") {
      defaultValue = opts.default ?? "";
      message = opts.message ?? "Input:";
      query = opts.hint ? `${message}\n  ${opts.hint}\n> ` : `${message}\n> `;
      resolveRaw = (raw): string | undefined => raw;
    } else if (opts.kind === "choice") {
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
    const waitSignal = AbortSignal.any([signal, onTimeout.signal]);

    let value = defaultValue;
    let via: PromptVia = "default";
    const multiline =
      opts.kind === "multiline" ? { until: opts.until ?? ("json" as MultilineUntil) } : undefined;
    const supervisor = activeSupervisor();
    try {
      // Supervised: hand off to whoever owns the terminal (Ink app / MCP client). Bare: read
      // the terminal directly. Either way the child keeps the timeout via `waitSignal`, so a
      // silent supervisor (or nobody) can't wedge the run.
      const outcome = supervisor
        ? await askSupervisor(supervisor, { opts, message, defaultValue, resolveRaw }, waitSignal)
        : await askTerminal(query, resolveRaw, defaultValue, waitSignal, multiline);
      value = outcome.value;
      via = outcome.via;
    } catch {
      via = onTimeout.signal.aborted ? "timeout" : "default";
    } finally {
      if (timer) clearTimeout(timer);
    }

    console.log(via === "timeout" ? `timed out → ${value}` : `${value} (${via})`);
    attach(value); // resolves instance.ref → the answer
    emit("answer", { value, via });
    return value;
  });
