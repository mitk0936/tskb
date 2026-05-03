import {
  type Folder,
  type File,
  type External,
  Doc,
  H1,
  H2,
  P,
  List,
  Li,
  Flow,
  Step,
  Relation,
  ref,
} from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      tests: Folder<{
        desc: "End-to-end tests for the tskb CLI.";
        path: "tests";
        boundary: "E2E tests";
      }>;
      "tests.e2e": Folder<{
        desc: "E2E test files that run the CLI and check its output.";
        path: "tests/e2e";
      }>;
      "tests.e2e.fixture": Folder<{
        desc: "A small sample project used as the test subject — like a real repo that adopted tskb.";
        path: "tests/e2e/fixture";
        boundary: "test-fixtures";
      }>;
      "tests.e2e.fixture.src": Folder<{
        desc: "Fixture source code (models, services, routes).";
        path: "tests/e2e/fixture/src";
      }>;
      "tests.e2e.fixture.docs": Folder<{
        desc: "Fixture .tskb.tsx docs covering all doc priorities.";
        path: "tests/e2e/fixture/docs";
      }>;
    }

    interface Externals {
      vitest: External<{
        desc: "The test runner.";
        url: "https://vitest.dev";
        kind: "npm-package";
      }>;
    }

    interface Files {
      "vitest.config": File<{
        desc: "Vitest configuration.";
        path: "vitest.config.ts";
      }>;
      "tests.global-setup": File<{
        desc: "Builds the fixture graph once before tests run; cleans up after.";
        path: "tests/e2e/global-setup.ts";
      }>;
      "tests.helpers": File<{
        desc: "Shared helpers used by every test file.";
        path: "tests/e2e/helpers.ts";
      }>;
      "tests.init": File<{
        desc: "Tests for `tskb init`.";
        path: "tests/e2e/init.test.ts";
      }>;
      "tests.build": File<{
        desc: "Tests for `tskb build` output.";
        path: "tests/e2e/build.test.ts";
      }>;
      "tests.commands": File<{
        desc: "Tests for every query command.";
        path: "tests/e2e/commands.test.ts";
      }>;
      "tests.disambiguation": File<{
        desc: "Tests for resolving identifiers that match more than one node.";
        path: "tests/e2e/disambiguation.test.ts";
      }>;
      "tests.graph-integrity": File<{
        desc: "Tests that the built graph is internally consistent.";
        path: "tests/e2e/graph-integrity.test.ts";
      }>;
    }
  }
}

const VitestExternal = ref as tskb.Externals["vitest"];
const TestsFolder = ref as tskb.Folders["tests"];
const E2eFolder = ref as tskb.Folders["tests.e2e"];
const FixtureFolder = ref as tskb.Folders["tests.e2e.fixture"];
const VitestConfig = ref as tskb.Files["vitest.config"];
const GlobalSetup = ref as tskb.Files["tests.global-setup"];
const Helpers = ref as tskb.Files["tests.helpers"];
const InitTest = ref as tskb.Files["tests.init"];
const BuildTest = ref as tskb.Files["tests.build"];
const CommandsTest = ref as tskb.Files["tests.commands"];
const DisambiguationTest = ref as tskb.Files["tests.disambiguation"];
const GraphIntegrityTest = ref as tskb.Files["tests.graph-integrity"];
const CliBuild = ref as tskb.Exports["cli.build"];

export default (
  <Doc explains="How is the tskb CLI validated end-to-end?" priority="supplementary">
    <H1>E2E Test Infrastructure</H1>
    <P>
      The test suite ({TestsFolder}) validates the entire tskb CLI by running it as a subprocess
      against a realistic fixture project. Tests use Vitest and spawn the built CLI binary via
      Node's execFileSync, asserting on stdout and generated artifacts.
    </P>

    <Relation from={TestsFolder} to={VitestExternal} label="test runner" />

    <Flow
      name="e2e-test-execution"
      desc="Developer runs `npm test`: Vitest loads config, global setup builds the fixture graph, test files exercise every CLI command, teardown cleans output"
    >
      <Step node={VitestConfig} label="discovers test files, registers global setup" />
      <Step node={GlobalSetup} label="builds fixture graph once via tskb build" />
      <Step node={Helpers} label="provides CLI runners and graph loader to all test files" />
      <Step node={GlobalSetup} label="teardown cleans .tskb/ output directory" />
    </Flow>

    <Flow
      name="init-scaffolding-test"
      desc="`init.test.ts` runs: copies fixture to a temp dir, invokes `tskb init`, asserts the generated files"
    >
      <Step
        node={InitTest}
        label="orchestrates the test: arranges temp dir, runs init, asserts output"
      />
      <Step node={Helpers} label="copies fixture src/ into the temp directory" />
      <Step node={CliBuild} label="runs tskb init --yes in the temp directory" />
      <Step
        node={InitTest}
        label="asserts scaffolded files: tsconfig, starter doc, scripts, AI dirs"
      />
    </Flow>

    <H2>Fixture Project</H2>
    <P>
      The fixture at {FixtureFolder} is a small task-management TypeScript app with models,
      services, API routes, and utilities. It includes its own tskb docs folder with 6 doc files
      covering all three priority levels (essential, constraint, supplementary) and all registry
      primitives (Folder, Module, Export, Term, External, Relation, Flow). This makes it a
      comprehensive test subject for the full build and query pipeline.
    </P>

    <H2>Test Structure</H2>
    <P>
      Tests are split into focused files under {E2eFolder}, sharing utilities from {Helpers}. A
      Vitest global setup ({GlobalSetup}) builds the fixture graph once before any test runs.
    </P>
    <List>
      <Li>{InitTest} — scaffolding tests with idempotency checks</Li>
      <Li>{BuildTest} — graph output validation: node counts, priorities, edges</Li>
      <Li>{CommandsTest} — exercises every query command in plain and JSON modes</Li>
      <Li>{DisambiguationTest} — ambiguous ID resolution across commands</Li>
      <Li>{GraphIntegrityTest} — edge consistency, type signatures, external metadata</Li>
    </List>

    <H2>Running Tests</H2>
    <P>
      Tests require the package to be built first (npm run build). Run with npm test (vitest run) or
      npm run test:watch (vitest) for interactive mode. The 60-second timeout in {VitestConfig}
      accounts for CLI subprocess startup cost.
    </P>
  </Doc>
);
