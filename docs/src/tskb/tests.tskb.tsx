import { type Folder, type File, Doc, H1, H2, P, List, Li, Flow, Step, ref } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      tests: Folder<{
        desc: "End-to-end test suite for the tskb CLI, using Vitest";
        path: "tests";
      }>;
      "tests.e2e": Folder<{
        desc: "E2E tests that exercise the full tskb pipeline: init scaffolding, build, and every query command";
        path: "tests/e2e";
      }>;
      "tests.e2e.fixture": Folder<{
        desc: "A small task-management TypeScript app used as the test subject. Has its own src/, docs/, and package.json, simulating a real user project adopting tskb";
        path: "tests/e2e/fixture";
      }>;
      "tests.e2e.fixture.src": Folder<{
        desc: "Fixture source code: models (User, Task, Project), services (Auth, Task, Project), API routes, and a logger utility";
        path: "tests/e2e/fixture/src";
      }>;
      "tests.e2e.fixture.docs": Folder<{
        desc: "Fixture tskb docs: vocabulary, architecture, auth, tasks, and a service-isolation constraint. Covers all doc priorities";
        path: "tests/e2e/fixture/docs";
      }>;
    }

    interface Files {
      "vitest.config": File<{
        desc: "Vitest configuration — includes tests/**/*.test.ts with a 60s timeout for CLI subprocess tests, registers global setup";
        path: "vitest.config.ts";
      }>;
      "tests.global-setup": File<{
        desc: "Vitest global setup — builds the fixture graph once before all tests, cleans .tskb/ on teardown";
        path: "tests/e2e/global-setup.ts";
      }>;
      "tests.helpers": File<{
        desc: "Shared test utilities — CLI runners (tskb, tskbIn), graph loader, path constants, and copyDir helper";
        path: "tests/e2e/helpers.ts";
      }>;
      "tests.init": File<{
        desc: "Scaffolding tests — copies fixture to temp dir, runs init --yes, asserts generated files and idempotency";
        path: "tests/e2e/init.test.ts";
      }>;
      "tests.build": File<{
        desc: "Build output tests — asserts graph.json/dot exist, verifies node counts, doc priorities, and relation edges";
        path: "tests/e2e/build.test.ts";
      }>;
      "tests.commands": File<{
        desc: "Command tests — exercises every query command (ls, search, pick, docs, flows, context) in plain and JSON modes";
        path: "tests/e2e/commands.test.ts";
      }>;
      "tests.disambiguation": File<{
        desc: "Disambiguation tests — ambiguous ID resolution across search, pick, and context commands";
        path: "tests/e2e/disambiguation.test.ts";
      }>;
      "tests.graph-integrity": File<{
        desc: "Graph integrity tests — validates edge consistency, type signatures, external metadata, and all edge targets resolve";
        path: "tests/e2e/graph-integrity.test.ts";
      }>;
    }
  }
}

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
  <Doc
    explains="E2E test infrastructure: Vitest suite, fixture project, and CLI validation strategy"
    priority="supplementary"
  >
    <H1>E2E Test Infrastructure</H1>
    <P>
      The test suite ({TestsFolder}) validates the entire tskb CLI by running it as a subprocess
      against a realistic fixture project. Tests use Vitest and spawn the built CLI binary via
      Node's execFileSync, asserting on stdout and generated artifacts.
    </P>

    <Flow
      name="e2e-test-execution"
      priority="essential"
      desc="Full E2E run: global setup builds fixture graph, test files exercise every CLI command, teardown cleans output"
    >
      <Step node={VitestConfig} label="Discovers test files, registers global setup" />
      <Step node={GlobalSetup} label="Builds fixture graph once via tskb build" />
      <Step node={Helpers} label="Provides CLI runners and graph loader to all test files" />
      <Step node={GlobalSetup} label="Teardown cleans .tskb/ output directory" />
    </Flow>

    <Flow
      name="init-scaffolding-test"
      desc="How the init command is tested: copies fixture to temp dir, runs init, asserts generated files"
    >
      <Step node={Helpers} label="Copies fixture src/ into a temp directory" />
      <Step node={CliBuild} label="Runs tskb init --yes in the temp directory" />
      <Step
        node={E2eFolder}
        label="Asserts scaffolded files: tsconfig, starter doc, scripts, AI dirs"
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
