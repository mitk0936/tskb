import type { LogEntry } from "../foundation/LogEntry.ts";

/**
 * A normalized prompt request the supervisor renders. The `prompt` action builds it;
 * `interaction.ts` treats it as an opaque payload (no dependency on the action layer,
 * so there is no core→actions import cycle).
 */
export interface PromptSpec {
  kind: "input" | "choice" | "multiline";
  message: string;
  default: string;
  choices?: { label: string; value: string }[];
  /** A one-line type sketch shown with the message — set for `multiline` JSON prompts. */
  hint?: string;
}

// child → supervisor
export type ChildMessage =
  | { kind: "prompt"; id: string; spec: PromptSpec }
  | { kind: "prompt-done"; id: string }
  | { kind: "log"; entry: LogEntry }
  | { kind: "settled"; ok: boolean; folder: string; summary: string[] };

// supervisor → child
export type AnswerMessage = { kind: "answer"; id: string; value: string; via: string };
export type SupervisorMessage = AnswerMessage | { kind: "cancel" };

type Send = (message: ChildMessage) => void;
type OnMessage = (handler: (message: SupervisorMessage) => void) => void;

/**
 * The child-side handle to an out-of-process supervisor. Sends prompt requests, live log
 * entries, and the final verdict up the channel; resolves prompts when the matching answer
 * comes back; and invokes a cancel handler on a `cancel` message. Purely a transport — it
 * decides nothing (the child keeps its own prompt timeout; see the `prompt` action).
 */
export class Supervisor {
  private seq = 0;
  private readonly pending = new Map<string, (answer: AnswerMessage) => void>();
  private cancelHandler: (() => void) | undefined;

  constructor(
    private readonly send: Send,
    onMessage: OnMessage
  ) {
    onMessage((message) => {
      if (message.kind === "answer") {
        const resolve = this.pending.get(message.id);
        if (resolve) {
          this.pending.delete(message.id);
          resolve(message);
        }
      } else if (message.kind === "cancel") {
        this.cancelHandler?.();
      }
    });
  }

  request(spec: PromptSpec, signal: AbortSignal): Promise<AnswerMessage> {
    const id = `p${++this.seq}`;
    return new Promise<AnswerMessage>((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(id);
        // The child is giving up on this prompt (timeout or teardown) and moving on. Tell the
        // supervisor so it withdraws the prompt from its UI — otherwise a stale, unanswerable
        // prompt box lingers on screen for the rest of the run.
        this.send({ kind: "prompt-done", id });
        reject(new Error("prompt aborted"));
      };
      if (signal.aborted) return onAbort();
      signal.addEventListener("abort", onAbort, { once: true });
      this.pending.set(id, (answer) => {
        signal.removeEventListener("abort", onAbort);
        resolve(answer);
      });
      this.send({ kind: "prompt", id, spec });
    });
  }

  log(entry: LogEntry): void {
    this.send({ kind: "log", entry });
  }

  settled(ok: boolean, folder: string, summary: string[]): void {
    this.send({ kind: "settled", ok, folder, summary });
  }

  onCancel(handler: () => void): void {
    this.cancelHandler = handler;
  }
}

/** Build a supervisor over an arbitrary channel — used in tests and by {@link detect}. */
export function createSupervisor(send: Send, onMessage: OnMessage): Supervisor {
  return new Supervisor(send, onMessage);
}

/**
 * The real supervisor when this process was `fork`ed with an IPC channel and marked
 * supervised (`OMKIT_SUPERVISED=1`), else `null`. Detected once at import.
 */
function detect(): Supervisor | null {
  const supervised = process.env.OMKIT_SUPERVISED === "1" && typeof process.send === "function";
  // Read the flag once, then clear it from the environment so any subprocess this run spawns
  // (a shell command, a nested `npm test`, …) does not inherit it and spuriously enter
  // supervised mode. Each omkit child's status is set explicitly by whoever forks it.
  delete process.env.OMKIT_SUPERVISED;
  if (!supervised) return null;
  const send: Send = (message) => void process.send!(message);
  const onMessage: OnMessage = (handler) =>
    process.on("message", (m) => handler(m as SupervisorMessage));
  return createSupervisor(send, onMessage);
}

let current: Supervisor | null = detect();

/** The active supervisor, or `null` when running bare. */
export function activeSupervisor(): Supervisor | null {
  return current;
}

/** Test seam: override the active supervisor (pass `null` to restore bare mode). */
export function installSupervisor(supervisor: Supervisor | null): void {
  current = supervisor;
}
