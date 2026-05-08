import { Doc, P, List, Li, ref } from "tskb";

const TestsFolder = ref as tskb.Folders["tests"];
const FixtureFolder = ref as tskb.Folders["tests.e2e.fixture"];
const CommandsTest = ref as tskb.Files["tests.commands"];
const BuildTest = ref as tskb.Files["tests.build"];
const InitTest = ref as tskb.Files["tests.init"];
const GraphIntegrityTest = ref as tskb.Files["tests.graph-integrity"];
const VitestExternal = ref as tskb.Externals["vitest"];

export default (
  <Doc
    explains="What test coverage is required for new functionality in the tskb package?"
    priority="constraint"
  >
    <P>
      Any new behaviour added to the tskb package must ship with E2E coverage in {TestsFolder}. The
      suite runs the built CLI as a subprocess against the fixture project at {FixtureFolder} via{" "}
      {VitestExternal}, so changes are validated against a realistic shape rather than mocks. Tests
      must pass before a change is merged or the package is published.
    </P>
    <P>Pick the test file that owns the surface you changed:</P>
    <List>
      <Li>
        New or modified query command (search, pick, context, ls, docs, flows, registry, ...) →{" "}
        {CommandsTest}. Cover both plain and JSON output, and any new flag.
      </Li>
      <Li>
        Build output or graph shape (new node kind, new edge type, metadata field, summary) →{" "}
        {BuildTest}, with structural invariants in {GraphIntegrityTest}.
      </Li>
      <Li>
        Init / scaffolding flow (new generated files, prompts, defaults, idempotency) → {InitTest}.
      </Li>
    </List>
    <P>
      If the new feature needs fixture data the existing one doesn't provide — a new registry
      primitive, a new doc shape, a new boundary kind, a new external — extend {FixtureFolder}{" "}
      first, then write the test. A passing test that doesn't actually exercise the new surface is
      worse than no test.
    </P>
  </Doc>
);
