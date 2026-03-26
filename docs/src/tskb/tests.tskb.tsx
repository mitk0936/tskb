import { type Folder, type File, Doc, H1, H2, P, List, Li, ref } from "tskb";

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
        desc: "Vitest configuration — includes tests/**/*.test.ts with a 60s timeout for CLI subprocess tests";
        path: "vitest.config.ts";
      }>;
      "tests.e2e.test": File<{
        desc: "Main e2e test file — tests across init scaffolding and full CLI pipeline (build, ls, search, pick, docs, context, JSON output, graph integrity)";
        path: "tests/e2e/tskb-e2e.test.ts";
      }>;
    }
  }
}

const TestsFolder = ref as tskb.Folders["tests"];
const FixtureFolder = ref as tskb.Folders["tests.e2e.fixture"];
const TestFile = ref as tskb.Files["tests.e2e.test"];
const VitestConfig = ref as tskb.Files["vitest.config"];

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

    <H2>Fixture Project</H2>
    <P>
      The fixture at {FixtureFolder} is a small task-management TypeScript app with models,
      services, API routes, and utilities. It includes its own tskb docs folder with 5 doc files
      covering all three priority levels (essential, constraint, supplementary) and all registry
      primitives (Folder, Module, Export, Term, External, Relation). This makes it a comprehensive
      test subject for the full build and query pipeline.
    </P>

    <H2>Test Structure</H2>
    <P>The test file ({TestFile}) has two top-level describe blocks:</P>
    <List>
      <Li>
        <strong>tskb init</strong> — scaffolding tests. Copies the fixture src/ into a temp
        directory, runs init --yes (non-interactive), then asserts on created files:
        docs/tsconfig.json, architecture.tskb.tsx, package.json scripts, .claude/skills/, .github/.
        Also verifies idempotency (re-running init does not overwrite user edits).
      </Li>
      <Li>
        <strong>tskb e2e</strong> — full pipeline tests. Builds the fixture graph, then tests every
        query command (ls, search, pick, docs, context) in both plain and JSON output modes. A graph
        integrity section validates edge consistency: belongs-to, contains, references, imports,
        related-to edges, type signatures, external metadata, and that all edge targets reference
        existing nodes.
      </Li>
    </List>

    <H2>Running Tests</H2>
    <P>
      Tests require the package to be built first (npm run build). Run with npm test (vitest run) or
      npm run test:watch (vitest) for interactive mode. The 60-second timeout in {VitestConfig}
      accounts for CLI subprocess startup cost.
    </P>
  </Doc>
);
