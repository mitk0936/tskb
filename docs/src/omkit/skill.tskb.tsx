import {
  type Folder,
  type Module,
  type Export,
  type Term,
  Doc,
  H1,
  H2,
  P,
  List,
  Li,
  Relation,
  Flow,
  Step,
  ref,
} from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Folders {
      "omkit.skill": Folder<{
        desc: "The generated-skill layer: turns what a project's oms and actions declare into a committed markdown map an assistant reads before its first tool call.";
        path: "packages/omkit/src/skill";
      }>;
    }

    interface Modules {
      "omkit.skill.model": Module<{
        desc: "Folds the discovery fork's registrations and the AST scan into one sorted model, and hashes it — the hash that detects drift.";
        type: typeof import("packages/omkit/src/skill/model.js");
      }>;

      "omkit.skill.render": Module<{
        desc: "The model as markdown: frontmatter, the shell and MCP invocations, one section per workflow, and the limits of the outline.";
        type: typeof import("packages/omkit/src/skill/render.js");
      }>;

      "omkit.skill.file": Module<{
        desc: "The only I/O in the layer: reads back the authored description and the previous hash, and writes the file with its directories.";
        type: typeof import("packages/omkit/src/skill/file.js");
      }>;

      "omkit.skill.index": Module<{
        desc: "The layer's public surface — the pure model and renderer alongside the one module that touches a disk.";
        type: typeof import("packages/omkit/src/skill/index.js");
      }>;

      "omkit.client.outline": Module<{
        desc: "The static reading of an om body: imported calls in source order, each with the tag authored on its own fluent chain.";
        type: typeof import("packages/omkit/src/client/outline.js");
      }>;

      "omkit.cli.commands.skill": Module<{
        desc: "The `omkit skill` adapter: discovers, builds the model, preserves the description, then writes or reports drift under --check.";
        type: typeof import("packages/omkit/src/cli/commands/skill.js");
      }>;

      "omkit.cli.commands.ls": Module<{
        desc: "The `omkit ls` renderer: the AST scan by default, plus declared summaries and exposure markers under --describe.";
        type: typeof import("packages/omkit/src/cli/commands/ls.js");
      }>;
    }

    interface Exports {
      "omkit.skill.buildSkillModel": Export<{
        desc: "Keeps the exposed entries, sorts them, resolves each one's argument sketch and outline, and returns the model with its hash.";
        type: typeof import("packages/omkit/src/skill/model.js").buildSkillModel;
      }>;

      "omkit.skill.renderSkill": Export<{
        desc: "Renders the model deterministically — no timestamps, no absolute paths, so a committed file only changes when the project does.";
        type: typeof import("packages/omkit/src/skill/render.js").renderSkill;
      }>;

      "omkit.skill.readExisting": Export<{
        desc: "Reads back the two things a regeneration must not lose: the authored description and the hash to compare against.";
        type: typeof import("packages/omkit/src/skill/file.js").readExisting;
      }>;

      "omkit.outlineBody": Export<{
        desc: "Walks an om body for imported calls and their tags. An approximation by construction, and labelled as one wherever it is rendered.";
        type: typeof import("packages/omkit/src/client/outline.js").outlineBody;
      }>;

      "omkit.SkillModel": Export<{
        desc: "Everything the renderer needs — the exposed oms and actions, sorted — plus the hash computed over them.";
        type: import("packages/omkit/src/skill/model.js").SkillModel;
      }>;
    }

    interface Terms {
      "registry-hash": Term<"Eight hex characters over a project's registration data — names, paths, summaries, modes, argument schemas, and outlines — carried in the generated file's header. Deliberately not a hash of the rendered markdown, so reformatting the file is not drift while an edited om is.">;
      "calls-outline": Term<"The list of steps shown under a workflow, read statically from its body rather than from a run. A conditional call appears unconditionally, a loop appears once, a dynamically chosen action does not appear, and a call inside a helper is invisible.">;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const SkillFolder = ref as tskb.Folders["omkit.skill"];
const SkillModelModule = ref as tskb.Modules["omkit.skill.model"];
const SkillRender = ref as tskb.Modules["omkit.skill.render"];
const SkillFile = ref as tskb.Modules["omkit.skill.file"];
const SkillIndex = ref as tskb.Modules["omkit.skill.index"];
const OutlineModule = ref as tskb.Modules["omkit.client.outline"];
const SkillCommand = ref as tskb.Modules["omkit.cli.commands.skill"];
const LsCommand = ref as tskb.Modules["omkit.cli.commands.ls"];

const BuildSkillModel = ref as tskb.Exports["omkit.skill.buildSkillModel"];
const RenderSkill = ref as tskb.Exports["omkit.skill.renderSkill"];
const ReadExisting = ref as tskb.Exports["omkit.skill.readExisting"];
const OutlineBody = ref as tskb.Exports["omkit.outlineBody"];
const SkillModelType = ref as tskb.Exports["omkit.SkillModel"];

const DiscoverRegistrations = ref as tskb.Exports["omkit.discoverRegistrations"];
const RegistrationSetType = ref as tskb.Exports["omkit.RegistrationSet"];
const DiscoveryMode = ref as tskb.Modules["omkit.core.discovery-mode"];
const McpFolder = ref as tskb.Folders["omkit.mcp"];
const RunFolderModule = ref as tskb.Modules["omkit.output.run-folder"];

const RegistryHash = ref as tskb.Terms["registry-hash"];
const CallsOutline = ref as tskb.Terms["calls-outline"];
const McpExposure = ref as tskb.Terms["mcp-exposure"];
const DiscoveryFork = ref as tskb.Terms["discovery-fork"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="How does omkit generate a skill file, and what does that file promise?"
    priority="essential"
  >
    <H1>The generated skill — what this repo can run, before the first call</H1>

    <P>
      An assistant arriving at a repo cannot tell what workflows it may run. {LsCommand} prints
      names and file basenames; to learn what a workflow <em>does</em>, or what arguments it takes,
      something has to open the file and read it. The {McpFolder} answers this at runtime, but pays
      a round trip for it: an assistant must call <code>list_oms</code> before it can build
      arguments for anything.
    </P>
    <P>
      A skill file is already in context before the first tool call. {SkillFolder} generates one, so
      the round trip disappears — and because the file documents the shell invocation too, it works
      for an assistant with no MCP wiring at all.
    </P>

    <H2>Where the content comes from</H2>
    <P>
      Two passes answer different halves, and neither alone is enough. {DiscoverRegistrations} knows
      summaries, exposure, and argument schemas, because those values only exist once a module has
      been evaluated — that is the {DiscoveryFork}, and it is the only reason generation touches
      user code at all. The static scan knows the {CallsOutline} and whether an action publishes a
      capability. {BuildSkillModel} folds both into one sorted {SkillModelType}, keyed on each
      entry's name in its defining file so a name reused across two files cannot cross over.
    </P>
    <P>
      Exposure stays opt-in. Only an entry the author marked with {McpExposure} is listed, which is
      the same rule the MCP server applies — generating a map can never widen what an assistant will
      attempt.
    </P>

    <H2>Why generation runs nothing</H2>
    <P>
      Importing an om file runs it. {DiscoveryMode} is what makes reading one safe: under{" "}
      <code>OMKIT_DISCOVER=1</code> the launch returns after reporting what it declares, before any
      execution tree exists. Generating the skill for a project whose oms start servers and browsers
      starts neither.
    </P>

    <H2>What the file says about itself</H2>
    <P>
      A committed generated file drifts silently, so the header carries a {RegistryHash} and{" "}
      <code>omkit skill --check</code> exits non-zero when it no longer matches — usable from a hook
      or a CI step without prescribing either. {RenderSkill} is deterministic by construction: no
      timestamps, no absolute paths, and a model that arrives already sorted. A generated file that
      is committed and churns on every run is a file people stop reading.
    </P>
    <P>
      The one hand-editable field is <code>description</code>, because it decides whether an
      assistant loads the file at the right moment — a generated summary of contents would be the
      wrong shape, since the field has to say <em>when to use this</em>. {ReadExisting} preserves
      whatever the author wrote, continuation lines and all; the built-in wording is only ever
      written into a file that does not exist yet.
    </P>

    <H2>The limits it states out loud</H2>
    <P>
      {OutlineBody} reads a body, not a trace, and the generated file says so in its own words. A
      conditional call is listed unconditionally, a loop is listed once, an action chosen at runtime
      is not listed, and a call made inside a helper function is invisible to it. The file also
      records that <code>list_oms</code> is authoritative at runtime — the skill is orientation, and
      orientation is allowed to be a little stale.
    </P>
    <P>
      Where a run's output lands is not restated loosely: the file names {RunFolderModule}'s layout
      exactly, because a run's identity is a contract and an assistant guessing at a second
      addressing scheme would find nothing.
    </P>

    <H2>The shape of the layer</H2>
    <List>
      <Li>
        {SkillModelModule} and {SkillRender} are pure — data in, data out. That is what makes
        determinism testable without touching a disk.
      </Li>
      <Li>
        {SkillFile} is the only module that reads or writes, and {SkillIndex} is the surface the
        command uses.
      </Li>
      <Li>
        {OutlineModule} sits with the client rather than here, because it is part of reading a
        project, not part of rendering one.
      </Li>
      <Li>
        {SkillCommand} does the wiring, and the same registrations power{" "}
        <code>omkit ls --describe</code> — which is opt-in precisely so plain <code>ls</code> stays
        the AST scan and nothing else.
      </Li>
    </List>

    <Flow
      name="omkit-skill-generation"
      desc="`omkit skill` generates the runnable-workflow map: the fork reports what each om declares, the AST scan supplies the outline, and the model is hashed, rendered, and written"
      priority="supplementary"
    >
      <Step node={SkillCommand} label="resolves the project root and asks the client" />
      <Step node={DiscoverRegistrations} label="forks to read summaries, exposure, and schemas" />
      <Step node={OutlineBody} label="reads each body statically for its tagged steps" />
      <Step node={BuildSkillModel} label="keeps the exposed entries, sorts them, and hashes" />
      <Step node={ReadExisting} label="recovers the authored description and the previous hash" />
      <Step node={RenderSkill} label="renders the markdown deterministically" />
      <Step node={SkillFile} label="writes it, or --check reports the drift instead" />
    </Flow>

    <Relation from={SkillFolder} to={RegistrationSetType} label="reads its content from" />
    <Relation from={SkillCommand} to={SkillIndex} label="drives" />
    <Relation
      from={LsCommand}
      to={RegistrationSetType}
      label="renders summaries from, under --describe"
    />
    <Relation from={SkillModelModule} to={CallsOutline} label="carries, without promising" />
  </Doc>
);
