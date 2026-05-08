import ts from "typescript";
import path from "node:path";

/**
 * Creates a TypeScript Program from a list of files and a tsconfig.
 *
 * WHAT IS A TYPESCRIPT PROGRAM?
 * It's TypeScript compiler's internal representation of your code:
 * - Source files (parsed into AST)
 * - Type checker (resolves types, finds symbols)
 * - Compiler options (from tsconfig.json)
 *
 * WHY WE NEED IT:
 * We're not compiling code, we're ANALYZING it. The TypeScript compiler
 * API gives us tools to:
 * 1. Parse .ts/.tsx files into syntax trees
 * 2. Resolve types (what is Context<{...}>?)
 * 3. Find symbols (where is "tskb" namespace defined?)
 * 4. Walk ASTs to extract information
 *
 * THE PROCESS:
 * 1. Read tsconfig.json using ts.readConfigFile
 * 2. Parse it to get compiler options
 * 3. Create a Program with our files + those options
 * 4. Set noEmit=true because we're only reading, not compiling
 *
 * RESULT:
 * A Program object we can query to extract registry and docs.
 *
 * @param files - Array of absolute file paths to analyze
 * @param tsconfigPath - Path to tsconfig.json (for compiler options)
 * @returns TypeScript Program ready for analysis
 */
export function createProgram(files: string[], tsconfigPath: string): ts.Program {
  // Read and parse tsconfig.json to get compiler options
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (configFile.error) {
    throw new Error(`Failed to read tsconfig: ${configFile.error.messageText}`);
  }

  const configParseResult = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );

  if (configParseResult.errors.length > 0) {
    const errorMessages = configParseResult.errors.map((err) => err.messageText).join("\n");
    throw new Error(`Failed to parse tsconfig: ${errorMessages}`);
  }

  // Create compiler options, merging with our needs
  const compilerOptions: ts.CompilerOptions = {
    ...configParseResult.options,
    noEmit: true, // We don't need to emit JavaScript, just analyze the TypeScript AST
  };

  // Create the TypeScript Program
  // This parses all files, builds the AST, and creates a type checker
  const program = ts.createProgram({
    rootNames: files,
    options: compilerOptions,
  });

  // Check for TypeScript errors only in the specified files (not dependencies)
  const fileSet = new Set(files.map((f) => path.normalize(f)));
  const allDiagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];

  // Filter diagnostics to only include errors from the files we're analyzing
  const diagnostics = allDiagnostics.filter((diagnostic) => {
    if (!diagnostic.file) return false;
    return fileSet.has(path.normalize(diagnostic.file.fileName));
  });

  if (diagnostics.length > 0) {
    const errorMessages = diagnostics
      .map((diagnostic) => {
        if (diagnostic.file) {
          const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
            diagnostic.start!
          );
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
          return `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`;
        } else {
          return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
        }
      })
      .join("\n");
    throw new Error(`TypeScript compilation errors:\n${errorMessages}`);
  }

  return program;
}
