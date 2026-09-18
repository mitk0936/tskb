import path from "node:path";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkArgs } from "./validate.ts";
import { readVerdict, readVerdictAt } from "./verdict.ts";
import { resolveRunFolder, runFileLinks } from "./resources.ts";
import { hostFile, hostFolderName } from "./action-identity.ts";
import { publicEntry, tailFile, tailLive } from "./tail.ts";
import { attachElicitation, attachProgress } from "./progress.ts";
import type { LiveRun, RunRegistry } from "./runs.ts";
import type { OmkitClient } from "../client/index.ts";
import type { RegistrationSet } from "../client/registry.ts";
import type { RunSession, Verdict } from "../client/types.ts";

/**
 * How long a "settling" run gets before the server gives up on it. Generous: a real smoke
 * suite can take minutes, and a backstop that fires early is worse than none.
 *
 * This is a server-side safety net, not a promise the call will be awaited — MCP client
 * timeouts are client-side and typically far shorter. Anything routinely over about a
 * minute belongs in `start_om`.
 */
const SETTLE_TIMEOUT_MS = 10 * 60 * 1000;

/** How long teardown gets to finish writing the run folder after a backstop cancel. */
const TEARDOWN_GRACE_MS = 10_000;

/**
 * Wait for a run to settle, or cancel it and report that it did not.
 *
 * `mode` is the author's claim, and a wrong claim would otherwise hang the tool call until
 * the *client* times out — which surfaces as a transport error with no run folder and
 * nothing to read. Cancelling instead turns the mistake into a message that names it, and
 * the run still writes its folder on the way down, so there is something to inspect.
 */
async function settleWithin(session: RunSession, ms: number): Promise<Verdict | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    const winner = await Promise.race([session.result, expired]);
    if (winner) return winner;
    session.cancel();
    // Give teardown a chance to finish writing before reporting; the run is already lost
    // either way, so a slow teardown must not extend the wait indefinitely.
    await Promise.race([
      session.result,
      new Promise((resolve) => setTimeout(resolve, TEARDOWN_GRACE_MS)),
    ]);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/** Everything the tools need. Passed in so the server stays assembly and these stay logic. */
export interface ToolContext {
  readonly client: OmkitClient;
  /** Project root — run folders resolve under `<root>/logs`. */
  readonly root: string;
  /** Every run this server started, live or settled. */
  readonly runs: RunRegistry;
}

/**
 * One entry in `list_oms`: an om or an exposed action, flattened into a single list so a
 * client has one place to look for "what can I call". `kind` says which it is, because an
 * action's caveats differ — see the action-host notes in the spec.
 */
export interface ToolEntry {
  readonly kind: "om" | "action";
  readonly name: string;
  readonly mode: "settling" | "long-lived";
  readonly file: string;
  readonly summary?: string;
  /** `<name>-<hash8>` — where this entry's runs land under `logs/`. Oms only. */
  readonly folderName?: string;
  /** The exported binding an action-backed tool is invoked through. Actions only. */
  readonly exportName?: string;
  readonly inputSchema?: Record<string, unknown>;
  /** Set when the entry cannot be called, with the reason. */
  readonly unavailable?: string;
}

const entryShape = {
  kind: z.enum(["om", "action"]),
  name: z.string(),
  mode: z.enum(["settling", "long-lived"]),
  file: z.string(),
  summary: z.string().optional(),
  folderName: z.string().optional(),
  exportName: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  unavailable: z.string().optional(),
};

/**
 * The process-lifetime registry cache. Discovery forks a child and imports user code, so
 * it is far too expensive to repeat per tool call; a client that has changed a file asks
 * for `refresh: true`. (Watching for changes and emitting `tools/list_changed` is
 * deferred — the tool list itself never changes, only what `list_oms` returns.)
 */
function createRegistryCache(client: OmkitClient): (refresh?: boolean) => Promise<RegistrationSet> {
  let cached: Promise<RegistrationSet> | undefined;
  return (refresh = false) => {
    if (refresh || !cached) cached = client.discoverRegistrations();
    return cached;
  };
}

/** Flatten a registration set into the entries a client may call, dropping the rest. */
export function toEntries(set: RegistrationSet): ToolEntry[] {
  const entries: ToolEntry[] = [];
  for (const om of set.oms) {
    if (!om.mcp) continue; // exposure is opt-in
    entries.push({
      kind: "om",
      name: om.name,
      mode: om.mcp.mode,
      file: om.file,
      folderName: om.folderName,
      ...(om.summary ? { summary: om.summary } : {}),
      ...(om.inputSchema ? { inputSchema: om.inputSchema } : {}),
      ...(om.unavailable ? { unavailable: om.unavailable } : {}),
    });
  }
  for (const a of set.actions) {
    if (!a.mcp) continue;
    entries.push({
      kind: "action",
      name: a.name,
      mode: a.mcp.mode,
      file: a.file,
      exportName: a.exportName,
      ...(a.summary ? { summary: a.summary } : {}),
      ...(a.inputSchema ? { inputSchema: a.inputSchema } : {}),
      ...(a.unavailable ? { unavailable: a.unavailable } : {}),
    });
  }
  return entries;
}

/**
 * Every tool result carries a text block as well as `structuredContent`: a client that
 * ignores structured output still sees the answer. Return types are inferred so they stay
 * assignable to the SDK's `CallToolResult` union — annotating them as tuples does not.
 */
export function both<T>(structuredContent: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(structuredContent, null, 2) }],
    structuredContent,
  };
}

/** A tool failure, in MCP's shape: a message the model can act on, not a thrown stack. */
export function toolError(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

export function registerTools(server: McpServer, ctx: ToolContext): void {
  const registry = createRegistryCache(ctx.client);

  server.registerTool(
    "list_oms",
    {
      title: "List runnable omkit oms and actions",
      description:
        "Lists everything this project exposes over MCP: its name, what it does, whether " +
        "it settles on its own, and the JSON Schema for its arguments. Call this before " +
        "run_om or start_om — their `args` are not described by their own input schemas.",
      inputSchema: {
        refresh: z
          .boolean()
          .optional()
          .describe("Re-import the project's files. Use after editing an om or action."),
      },
      outputSchema: {
        entries: z.array(z.object(entryShape)),
        warnings: z.array(z.string()),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ refresh }) => {
      const set = await registry(refresh);
      return both({ entries: toEntries(set), warnings: set.warnings });
    }
  );

  /** Find an exposed entry by name. Oms win a collision — they are the primary surface. */
  const findEntry = async (name: string): Promise<ToolEntry | undefined> => {
    const entries = toEntries(await registry());
    return (
      entries.find((e) => e.kind === "om" && e.name === name) ??
      entries.find((e) => e.name === name)
    );
  };

  const notRunnable = (name: string, entry: ToolEntry | undefined): string | undefined => {
    if (!entry) return `no om or action named "${name}" is exposed. Call list_oms.`;
    if (entry.unavailable) return `"${name}" is unavailable: ${entry.unavailable}`;
    return undefined;
  };

  /**
   * Launch an entry as a supervised run.
   *
   * `OMKIT_ROOT` is this server's own root, stated rather than inherited: resources here
   * resolve under `<root>/logs`, so a run that writes its folder anywhere else is a run this
   * same server cannot serve, and `get_run`'s resource links would point at nothing. The
   * client would default it to the project owning the tsconfig — the same directory in
   * practice — but "the server serves what it writes" should not rest on the two agreeing.
   */
  const launch = (entry: ToolEntry, args: Record<string, unknown>): LiveRun => {
    // An action cannot run standalone, so an action-backed tool forks omkit's shipped host
    // om instead of the action's own file — which defines no om at all.
    const isAction = entry.kind === "action";
    const file = isAction ? hostFile() : entry.file;
    const env: Record<string, string> = {
      OMKIT_ROOT: ctx.root,
      ...(isAction
        ? {
            OMKIT_ACTION_FILE: entry.file,
            OMKIT_ACTION_NAME: entry.name,
            OMKIT_ACTION_EXPORT: entry.exportName!,
            OMKIT_ACTION_ARGS: JSON.stringify(args),
          }
        : { OMKIT_ARGS: JSON.stringify(args) }),
    };
    const folderName = isAction
      ? hostFolderName(entry.name, entry.file)
      : (entry.folderName ?? entry.name);
    return ctx.runs.start(entry.name, folderName, ctx.client.run(file, { cwd: ctx.root, env }));
  };

  server.registerTool(
    "run_om",
    {
      title: "Run an om and wait for its verdict",
      description:
        "Runs a settling om (or an exposed action) to completion and returns whether it " +
        "passed, where its run folder is, its assert tally, and any failures. Call " +
        "list_oms first to learn what `args` to pass. A long-lived entry is refused — use " +
        "start_om for those, and for anything that takes more than about a minute.",
      inputSchema: {
        name: z.string().describe("The om or action name, as reported by list_oms."),
        args: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Arguments matching the entry's inputSchema from list_oms."),
        settleTimeoutMs: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("How long to wait for the run to settle before giving up. Default 10 minutes."),
      },
      outputSchema: {
        ok: z.boolean(),
        folder: z.string(),
        assertions: z.object({ passed: z.number(), failed: z.number() }),
        failures: z.array(z.object({ action: z.string(), error: z.string() })),
        summary: z.array(z.string()),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ name, args, settleTimeoutMs }, extra) => {
      const entry = await findEntry(name);
      const refusal = notRunnable(name, entry);
      if (refusal || !entry) return toolError(refusal!);
      if (entry.mode === "long-lived") {
        return toolError(`"${name}" is long-lived — start it with start_om, not run_om.`);
      }
      const problems = checkArgs(entry.inputSchema, args ?? {});
      if (problems.length) return toolError(problems.join("\n"));

      const run = launch(entry, args ?? {});
      // This request lives for the whole run, so it can carry progress and it owns the
      // run's cancellation: `extra.signal` aborting means the client withdrew the call.
      attachProgress(run.session, extra);
      attachElicitation(server, run.session);
      const timeout = settleTimeoutMs ?? SETTLE_TIMEOUT_MS;
      const settled = await settleWithin(run.session, timeout);
      if (!settled) {
        return toolError(
          `"${name}" is declared settling but did not settle within ${timeout}ms, so it ` +
            `was cancelled. If it is meant to stay up, declare ` +
            `.mcp({ mode: "long-lived" }) and start it with start_om.`
        );
      }
      return both(await readVerdict(settled));
    }
  );

  server.registerTool(
    "start_om",
    {
      title: "Start an om without waiting for it",
      description:
        "Starts an om or exposed action and returns a handle straight away. Use this for a " +
        "long-lived entry (a server, a watcher), or for a long suite you want to check on " +
        "later. Follow up with get_run, tail_run and cancel_run.",
      inputSchema: {
        name: z.string().describe("The om or action name, as reported by list_oms."),
        args: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: {
        runId: z.string(),
        name: z.string(),
        // The dated run folder does not exist yet — this is the folder *family*.
        folderName: z.string(),
        mode: z.enum(["settling", "long-lived"]),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
    },
    async ({ name, args }) => {
      const entry = await findEntry(name);
      const refusal = notRunnable(name, entry);
      if (refusal || !entry) return toolError(refusal!);
      const problems = checkArgs(entry.inputSchema, args ?? {});
      if (problems.length) return toolError(problems.join("\n"));

      const run = launch(entry, args ?? {});
      // Elicitation only — deliberately no `attachProgress`. This request ends as soon as
      // the handle is returned, so its `extra.signal` aborts immediately, and wiring that
      // to `session.cancel()` would kill the run this tool exists to keep alive. A client
      // that wants progress from a started run polls `tail_run`.
      attachElicitation(server, run.session);
      return both({
        runId: run.id,
        name: entry.name,
        folderName: run.folderName,
        mode: entry.mode,
      });
    }
  );

  server.registerTool(
    "get_run",
    {
      title: "Check on a run",
      description:
        "Reports whether a run is still going and, once it has settled, its verdict and " +
        "links to the files it produced. `run` is a runId from start_om, or a run folder " +
        "path under logs/.",
      inputSchema: { run: z.string() },
      outputSchema: {
        status: z.enum(["running", "settled"]),
        name: z.string(),
        folder: z.string(),
        ok: z.boolean().optional(),
        assertions: z.object({ passed: z.number(), failed: z.number() }).optional(),
        failures: z.array(z.object({ action: z.string(), error: z.string() })).optional(),
        summary: z.array(z.string()).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ run }) => {
      const live = ctx.runs.get(run);
      if (live?.status === "running") {
        // The dated folder is stamped inside the child on first access, so there is
        // genuinely nothing to report here yet — not an empty string standing in for one.
        return both({ status: "running" as const, name: live.name, folder: "" });
      }

      // A run this server started, or a folder already on disk — confined either way.
      const folder = live?.verdict?.folder ?? resolveRunFolder(ctx.root, run);
      if (!folder) {
        return toolError(`no run "${run}" — pass a runId from start_om, or a folder under logs/.`);
      }
      const name = live?.name ?? path.basename(path.resolve(folder, "../.."));
      const verdict = live?.verdict ? await readVerdict(live.verdict) : await readVerdictAt(folder);

      // Links, not inlined content: `raw.jsonl` on a long run is megabytes, and a model
      // should read only what it turns out to need.
      const structuredContent = { status: "settled" as const, name, ...verdict };
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(structuredContent, null, 2) },
          ...runFileLinks(ctx.root, folder),
        ],
        structuredContent,
      };
    }
  );

  server.registerTool(
    "cancel_run",
    {
      title: "Cancel a running om",
      description:
        "Tears a run down gracefully. It still finishes writing its run folder, so the " +
        "logs and verdict of a cancelled run stay readable afterwards.",
      inputSchema: { runId: z.string() },
      outputSchema: { runId: z.string(), cancelled: z.boolean() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ runId }) => {
      const live = ctx.runs.get(runId);
      if (!live) return toolError(`no run "${runId}".`);
      // Already settled is not an error — cancelling twice, or cancelling something that
      // finished on its own, is a reasonable thing for a client to do.
      if (live.status === "settled") return both({ runId, cancelled: false });
      live.session.cancel();
      return both({ runId, cancelled: true });
    }
  );

  server.registerTool(
    "tail_run",
    {
      title: "Read a run's log from a cursor",
      description:
        "Returns log lines after `cursor`, from the live run while it is going and from " +
        "its raw.jsonl once it has settled. Pass the returned nextCursor back to continue. " +
        "`run` is a runId from start_om, or a run folder path under logs/.",
      inputSchema: {
        run: z.string(),
        cursor: z.number().int().nonnegative().optional().describe("0, or the last nextCursor."),
        limit: z.number().int().positive().max(1000).optional().describe("Default 200."),
      },
      outputSchema: {
        entries: z.array(
          z.object({
            sequence: z.number(),
            ts: z.number(),
            path: z.string(),
            level: z.string(),
            source: z.string(),
            message: z.string(),
          })
        ),
        nextCursor: z.number(),
        dropped: z.number(),
        status: z.enum(["running", "settled"]),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ run, cursor = 0, limit = 200 }) => {
      const live = ctx.runs.get(run);
      if (live?.status === "running") {
        const tail = tailLive(live, cursor, limit);
        return both({
          ...tail,
          entries: tail.entries.map(publicEntry),
          status: "running" as const,
        });
      }
      const folder = live?.verdict?.folder ?? resolveRunFolder(ctx.root, run);
      if (!folder) {
        return toolError(`no run "${run}" — pass a runId from start_om, or a folder under logs/.`);
      }
      const tail = tailFile(folder, cursor, limit);
      return both({ ...tail, entries: tail.entries.map(publicEntry), status: "settled" as const });
    }
  );
}
