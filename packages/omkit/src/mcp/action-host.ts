import { pathToFileURL } from "node:url";
import { om } from "../index.ts";
import { hostOmName } from "./action-identity.ts";

/**
 * The host om for an action-backed tool. Forked as the om file, with the action to run
 * named on the environment.
 *
 * An action cannot run standalone — `ExecutionTree.require()` throws outside a run — so
 * something has to host it. Nothing here is forged: `callerSite()` captures this file,
 * which genuinely is where the run is defined. The disambiguator lives in the **name**:
 * `seed@a1b2c3d4` is stable across runs, and two same-named actions in different files get
 * different suffixes and therefore different folders. That satisfies the
 * run-folder-identity contract through the name rather than around it, and avoids adding
 * an escape hatch that would let any caller claim another run's identity.
 *
 * Known sharp edge: an action declared with `.ref<H>()` publishes a capability for
 * downstream actions. Standalone it does its work and hands that capability to nobody —
 * `chromePage` would attach to Chrome and return nothing useful. Such actions make poor
 * tools. Documented, not prevented.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set — the MCP server sets it when forking this host`);
  }
  return value;
}

const file = required("OMKIT_ACTION_FILE");
const name = required("OMKIT_ACTION_NAME");
const exportName = required("OMKIT_ACTION_EXPORT");
// Deliberately not OMKIT_ARGS: this om declares no `.args()`, so nothing here would read
// that variable, and a distinct name keeps a host run from colliding with an om's args.
const args: unknown = JSON.parse(process.env.OMKIT_ACTION_ARGS ?? "{}");

interface Launchable {
  (a: unknown): { result: Promise<unknown> };
  readonly parseArgs: (supplied: unknown) => unknown;
}

om(hostOmName(name, file))
  .describe({ summary: `Standalone host for the ${name} action.` })
  .run(async () => {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
    const launch = mod[exportName];
    if (typeof launch !== "function") {
      throw new Error(`${file} has no exported action "${exportName}"`);
    }
    const action = launch as Launchable;
    // The server only checked that the JSON *looked* right (`checkArgs`). The schema that
    // list_oms advertised — defaults included — lives on the action, so the action applies
    // it: what the caller was told is what the body receives. An om does the same through
    // `resolveArgs` before its body runs.
    const resolved = action.parseArgs(args);
    // The action reaches `ExecutionTree.require()` through the copy of omkit *its* file
    // imported, and `current` is a static — so this only works when both resolve to the
    // same installed omkit. True for a normal install and for the fixtures; false under
    // `npm link`, a non-hoisted pnpm layout, or two omkit versions in one tree. The bare
    // error is undiagnosable from a client, so name the cause here.
    try {
      // The action's result becomes the run's `value`: the one thing an action-backed tool
      // call exists to hand back, read from `result.json` by the server's verdict.
      return await action(resolved).result;
    } catch (e) {
      if (e instanceof Error && /no active om\(\) run/.test(e.message)) {
        throw new Error(
          `${name} could not see this run. Its file resolved a different copy of omkit ` +
            `than the host did — check for a linked, duplicated, or non-hoisted omkit install.`
        );
      }
      throw e;
    }
  });
