import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { info, error } from "../utils/logger.js";

const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "esnext",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",

    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "allowJs": true,
    "esModuleInterop": true,

    "jsx": "react-jsx",
    "jsxImportSource": "tskb",

    "baseUrl": "../",
    "rootDir": "../"
  },
  "include": ["**/*.tskb.tsx"]
}
`;

const STARTER_DOC_TEMPLATE = (docsDir: string) => `import { Doc, H1, P } from "tskb";

// Declare your architectural vocabulary here.
// See: https://www.npmjs.com/package/tskb
declare global {
  namespace tskb {
    interface Folders {
      // "my-feature": Folder<{ desc: "Description of the folder"; path: "src/my-feature" }>;
    }
    interface Terms {
      // "my-concept": Term<"A key domain concept in this codebase">;
    }
  }
}

export default (
  <Doc explains="Project architecture overview" priority="essential">
    <H1>Architecture</H1>
    <P>Add your first architectural notes here. Declare folders, modules, and terms above.</P>
  </Doc>
);
`;

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function askYesNo(
  rl: readline.Interface,
  question: string,
  defaultYes = true
): Promise<boolean> {
  const hint = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = (await ask(rl, `${question} ${hint}: `)).trim().toLowerCase();
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}

export interface InitOptions {
  yes?: boolean;
}

/**
 * Interactive init command — scaffolds tskb in a new or existing repo.
 *
 * Steps:
 * 1. Ask for docs folder and tsconfig path (or use defaults with --yes)
 * 2. Ask whether to enable Claude Code / GitHub Copilot integrations
 * 3. Create docs/tsconfig.json, starter .tskb.tsx, and integration directories
 * 4. Add the tskb build script to package.json
 */
export async function init(options: InitOptions = {}): Promise<void> {
  const useDefaults = options.yes ?? false;
  const rl = useDefaults
    ? null
    : readline.createInterface({ input: process.stdin, output: process.stdout });

  info("");
  info("tskb init — set up architecture documentation in this repo");
  info("──────────────────────────────────────────────────────────");
  info("");

  try {
    let docsDir: string;
    let pattern: string;
    let tsconfigPath: string;
    let wantClaude: boolean;
    let wantCopilot: boolean;

    if (useDefaults) {
      docsDir = "docs";
      pattern = `${docsDir}/**/*.tskb.tsx`;
      tsconfigPath = `${docsDir}/tsconfig.json`;
      wantClaude = true;
      wantCopilot = true;

      info("Using defaults (--yes):");
      info(`  Docs folder: ${docsDir}`);
      info(`  Glob pattern: ${pattern}`);
      info(`  Tsconfig: ${tsconfigPath}`);
      info(`  Claude Code: yes`);
      info(`  GitHub Copilot: yes`);
      info("");
    } else {
      // 1. Docs folder
      const rawDocsDir = (await ask(rl!, "Docs folder [docs]: ")).trim();
      docsDir = rawDocsDir || "docs";

      // 2. Glob pattern
      const defaultPattern = `${docsDir}/**/*.tskb.tsx`;
      const rawPattern = (await ask(rl!, `Glob pattern [${defaultPattern}]: `)).trim();
      pattern = rawPattern || defaultPattern;

      // 3. tsconfig
      const defaultTsconfig = `${docsDir}/tsconfig.json`;
      const rawTsconfig = (await ask(rl!, `Docs tsconfig [${defaultTsconfig}]: `)).trim();
      tsconfigPath = rawTsconfig || defaultTsconfig;

      // 4. Integrations
      info("");
      wantClaude = await askYesNo(rl!, "Enable Claude Code skill (creates .claude/skills/)?");
      wantCopilot = await askYesNo(
        rl!,
        "Enable GitHub Copilot instructions (creates .github/instructions/)?"
      );

      rl!.close();
    }

    const cwd = process.cwd();

    // Create docs folder
    const absDocs = path.resolve(cwd, docsDir);
    if (!fs.existsSync(absDocs)) {
      fs.mkdirSync(absDocs, { recursive: true });
      info(`Created ${docsDir}/`);
    } else {
      info(`  ${docsDir}/ already exists, skipping`);
    }

    // Write docs/tsconfig.json
    const absTsconfig = path.resolve(cwd, tsconfigPath);
    if (!fs.existsSync(absTsconfig)) {
      fs.mkdirSync(path.dirname(absTsconfig), { recursive: true });
      fs.writeFileSync(absTsconfig, TSCONFIG_TEMPLATE, "utf-8");
      info(`Created ${tsconfigPath}`);
    } else {
      info(`  ${tsconfigPath} already exists, skipping`);
    }

    // Write starter doc
    const starterPath = path.join(absDocs, "architecture.tskb.tsx");
    if (!fs.existsSync(starterPath)) {
      fs.writeFileSync(starterPath, STARTER_DOC_TEMPLATE(docsDir), "utf-8");
      info(`Created ${docsDir}/architecture.tskb.tsx`);
    } else {
      info(`  ${docsDir}/architecture.tskb.tsx already exists, skipping`);
    }

    // Update package.json
    const pkgPath = path.resolve(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      const scripts = pkg.scripts ?? {};
      const scriptName = "docs";
      const scriptValue = `tskb "${pattern}" --tsconfig ${tsconfigPath}`;
      if (!scripts[scriptName]) {
        pkg.scripts = { ...scripts, [scriptName]: scriptValue };
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
        info(`Added "docs" script to package.json`);
      } else {
        info(`  "docs" script already exists in package.json, skipping`);
        info(`  To run tskb: ${scriptValue}`);
      }
    } else {
      info(`  package.json not found — add the following script manually:`);
      info(`    "docs": "tskb \\"${pattern}\\" --tsconfig ${tsconfigPath}"`);
    }

    // Create integration directories
    if (wantClaude) {
      const claudeSkillsDir = path.resolve(cwd, ".claude", "skills");
      if (!fs.existsSync(claudeSkillsDir)) {
        fs.mkdirSync(claudeSkillsDir, { recursive: true });
        info(`Created .claude/skills/ (run docs script to generate skill files)`);
      } else {
        info(`  .claude/skills/ already exists`);
      }
    }

    if (wantCopilot) {
      const githubDir = path.resolve(cwd, ".github");
      if (!fs.existsSync(githubDir)) {
        fs.mkdirSync(githubDir, { recursive: true });
        info(`Created .github/ (run docs script to generate instruction files)`);
      } else {
        info(`  .github/ already exists`);
      }
    }

    info("");
    info("✓ Done! Next steps:");
    info("");
    info("  1. Edit your starter doc:  " + path.join(docsDir, "architecture.tskb.tsx"));
    info("  2. Build the knowledge graph:  npm run docs");
    info("  3. Query the graph:  npx tskb ls --plain");
    info("");
    info("Tip: run `npm run docs` after any structural change to keep the graph fresh.");
    info("");
  } catch (err) {
    rl?.close();
    error("Init failed: " + (err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }
}
