import { type Module, Doc, H1, P, List, Li, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.cli.index": Module<{
        desc: "The omkit bin: parses argv, then routes to one lazily-loaded command; owns stdout and the exit code.";
        type: typeof import("packages/omkit/src/cli/index.js");
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const CliIndex = ref as tskb.Modules["omkit.cli.index"];
const CommandsFolder = ref as tskb.Folders["omkit.cli.commands"];
const ClientExport = ref as tskb.Exports["omkit.OmkitClient"];
const LsCommand = ref as tskb.Modules["omkit.cli.commands.ls"];
const SkillCommand = ref as tskb.Modules["omkit.cli.commands.skill"];
const McpFolder = ref as tskb.Folders["omkit.mcp"];
const SkillFolder = ref as tskb.Folders["omkit.skill"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="What are the omkit CLI commands?" priority="supplementary">
    <H1>The omkit commands</H1>
    <P>
      {CliIndex} points the <code>omkit</code> bin at a project — a <code>tsconfig.omkit.json</code>{" "}
      that lists your oms and actions — parses the command, and dispatches to a thin adapter in{" "}
      {CommandsFolder}. Each adapter drives the same {ClientExport}; the commands only differ in
      what they ask it for.
    </P>
    <List>
      <Li>
        <code>omkit init</code> — scaffold a starter project (the config, a sample om, a sample
        action).
      </Li>
      <Li>
        <code>omkit ls</code> — list the discovered oms and actions, via {LsCommand}. Add{" "}
        <code>--describe</code> to show what each one declares about itself; without it the command
        is the static scan and nothing else.
      </Li>
      <Li>
        <code>omkit check</code> — typecheck the project and report diagnostics.
      </Li>
      <Li>
        <code>omkit run &lt;om&gt;</code> — run one om directly by name or file path; with no
        argument it opens the interactive app. A bare <code>omkit</code> does the same.
      </Li>
      <Li>
        <code>omkit skill</code> — write the runnable-workflow map an assistant reads before its
        first call, through {SkillCommand}. <code>--check</code> reports drift and exits non-zero
        instead of writing; see {SkillFolder}.
      </Li>
      <Li>
        <code>omkit mcp</code> — serve the project over the Model Context Protocol on stdio, so an
        assistant can run a workflow and read what it produced; see {McpFolder}. Alone among the
        commands it prints nothing, because its stdout is the protocol stream.
      </Li>
      <Li>
        <code>omkit help</code> (also <code>--help</code> / <code>-h</code>) — print the command
        overview.
      </Li>
    </List>
    <P>
      Two of these read a project rather than run one, and they share a mechanism:{" "}
      <code>ls --describe</code> and <code>skill</code> both need values that only exist after a
      module has been evaluated, so both go through the discovery fork — and neither starts a
      workflow doing it.
    </P>

    <Relation from={CliIndex} to={ClientExport} label="routes every command through" />
  </Doc>
);
