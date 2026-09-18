import { pathToFileURL } from "node:url";
import type { ActionRegistration } from "./registry.ts";
import type { JsonSchema } from "../core/schema-json.ts";

/** The parent's opening message: sent over IPC, so no argv length limit applies. */
export interface ScanMessage {
  readonly kind: "scan";
  readonly files: string[];
}

/** The child's closing message. Om registrations arrive separately, as each om is reached. */
export interface ActionsMessage {
  readonly kind: "actions";
  readonly actions: ActionRegistration[];
  readonly warnings: string[];
}

/**
 * Duck-typed on purpose: the value came from whichever copy of omkit the user's file
 * imported, so `instanceof` would fail across copies. Only plain properties are read, and
 * the schema conversion is delegated back to that copy through `describeArgs`.
 */
interface ActionLike {
  readonly actionName: string;
  readonly description?: { summary: string };
  readonly mcp?: { mode: "settling" | "long-lived" };
  readonly describeArgs: () => {
    inputSchema: JsonSchema | undefined;
    schemaError: string | undefined;
  };
}

function asAction(value: unknown): ActionLike | undefined {
  if (typeof value !== "function") return undefined;
  const candidate = value as Partial<ActionLike>;
  if (typeof candidate.actionName !== "string") return undefined;
  if (typeof candidate.describeArgs !== "function") return undefined;
  return candidate as ActionLike;
}

/**
 * The discovery child. Forked with `OMKIT_DISCOVER=1`, so importing a file makes every
 * `om(...).run(...)` in it post a registration up this same channel instead of launching
 * (see core/discovery-mode.ts). Actions post nothing — they are plain values — so their
 * metadata is read off each module's exports here, afterwards.
 */
async function scan(files: string[]): Promise<void> {
  const actions: ActionRegistration[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    } catch (e) {
      warnings.push(`${file}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    for (const [exportName, value] of Object.entries(mod)) {
      const found = asAction(value);
      if (!found) continue;
      const { inputSchema, schemaError } = found.describeArgs();
      actions.push({
        name: found.actionName,
        exportName,
        file,
        ...(found.description ? { summary: found.description.summary } : {}),
        ...(found.mcp ? { mcp: found.mcp } : {}),
        ...(inputSchema ? { inputSchema } : {}),
        ...(schemaError ? { unavailable: schemaError } : {}),
      });
    }
  }

  // Exit only once the message has actually flushed. `process.send` is asynchronous —
  // exiting on the next line can drop the payload before it reaches the parent, and the
  // parent would see a `close` with no `actions` message and report an empty project.
  // A user module may also have started a server or a timer at import; nothing here is
  // supervised and nothing will tear it down, so leave deliberately rather than linger.
  const done = (): never => process.exit(0);
  if (process.send) {
    process.send({ kind: "actions", actions, warnings } satisfies ActionsMessage, done);
  } else {
    done();
  }
}

process.on("message", (message: unknown) => {
  if ((message as ScanMessage | undefined)?.kind === "scan") {
    void scan((message as ScanMessage).files);
  }
});
