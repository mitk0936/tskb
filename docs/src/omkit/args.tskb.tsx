import { type Module, type Export, Doc, H1, H2, P, List, Li, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.core.args": Module<{
        desc: "resolveArgs(schema, opts) — fills an om's declared args from supplied values, then the schema's defaults, then prompting.";
        type: typeof import("packages/omkit/src/core/args.js");
      }>;
    }

    interface Exports {
      "omkit.resolveArgs": Export<{
        desc: "Resolves an om's declared args: supplied values, then schema defaults, then prompting — fails naming every blocking field if nobody can be asked.";
        type: typeof import("packages/omkit/src/core/args.js").resolveArgs;
      }>;

      "omkit.MissingArgsError": Export<{
        desc: "Thrown when an arg can't be resolved and nobody can be asked — names every blocking field in one error.";
        type: typeof import("packages/omkit/src/core/args.js").MissingArgsError;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const ArgsModule = ref as tskb.Modules["omkit.core.args"];
const ResolveArgsExport = ref as tskb.Exports["omkit.resolveArgs"];
const MissingArgsErrorExport = ref as tskb.Exports["omkit.MissingArgsError"];

const OmModule = ref as tskb.Modules["omkit.core.om"];
const OmExport = ref as tskb.Exports["omkit.om"];
const ActionExport = ref as tskb.Exports["omkit.action"];
const ActionModule = ref as tskb.Modules["omkit.core.action"];

const SupervisionTerm = ref as tskb.Terms["structured-supervision"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="How does an om declare and receive arguments?">
    <H1>Run arguments</H1>
    <P>
      {OmExport} returns a builder: chaining <code>.args(schema)</code> — a zod schema — declares
      the run's input shape, and <code>.run</code>'s body then receives the resolved, typed value as
      its second parameter. This resolution is an {OmModule}-only feature. {ActionExport}'s own{" "}
      <code>.args(schema)</code>, declared in {ActionModule}, only pins the type of{" "}
      <code>.run</code>'s second parameter — nothing there resolves, validates, or prompts for a
      value, because an action launched from an om body already receives its arguments directly in
      code, not from the environment or a prompt.
    </P>

    <H2>Resolution happens inside the run</H2>
    <P>
      {ResolveArgsExport} in {ArgsModule} runs from inside the launched body, after {OmExport} has
      already started the run — not before it. Prompting is asynchronous, and the run must already
      exist for a prompt and its answer to land on the run's own timeline. An arg that can't be
      resolved is therefore an ordinary failure of the root node, governed by {SupervisionTerm} like
      any other failure, rather than a throw out of <code>om(...)</code> itself. Whatever it settles
      on is recorded on the root node, so <code>result.json</code> and the <code>main.log</code>{" "}
      header report what the run was actually given.
    </P>

    <Relation from={OmModule} to={ResolveArgsExport} label="fills declared args via" />

    <H2>Filling one field</H2>
    <P>Each field is filled from the first of these that can answer, in order:</P>
    <List>
      <Li>
        <strong>Supplied.</strong> <code>OMKIT_ARGS</code>, a JSON object read from the environment.
      </Li>
      <Li>
        <strong>Defaults.</strong> Whatever the schema itself defaults — a defaulted field is
        therefore never blocking and is never asked about.
      </Li>
      <Li>
        <strong>Prompt.</strong> Whatever is still missing, one field at a time, with a one-line
        type sketch; complex fields are asked for as a multiline JSON block, or a path to a JSON
        file. A blank answer is treated as no answer, not a value, and re-asks — an empty Enter on a
        required number must not silently coerce to <code>0</code>. Resolution gives up after three
        rounds of asking.
      </Li>
      <Li>
        <strong>Fail.</strong> {MissingArgsErrorExport}, naming every field still blocking at once.
      </Li>
    </List>

    <Relation
      from={ResolveArgsExport}
      to={MissingArgsErrorExport}
      label="throws when nothing can answer"
    />

    <H2>The non-interactive guard</H2>
    <P>
      Whether anyone can be asked is checked once, before any prompting starts: a supervising
      frontend or a real TTY counts as interactive, anything else does not. When it does not,{" "}
      {ResolveArgsExport} doesn't ask for the first missing field and then discover the second is
      unanswerable — it collects every blocking field up front and throws {MissingArgsErrorExport}{" "}
      immediately, naming all of them in one error rather than prompting into the void.
    </P>
  </Doc>
);
