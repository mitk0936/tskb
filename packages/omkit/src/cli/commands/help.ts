/**
 * The flat `omkit help` overview — one usage line, every command, and the global flags.
 * A pure string builder so it's trivially testable and reusable: `main` prints it for an
 * explicit `help`/`--help`, and again (to stderr) when an unknown command is given.
 */
export function helpText(): string {
  return [
    "omkit — run the workflows around your code",
    "",
    "Usage: omkit [command] [target] [flags]",
    "",
    "Commands:",
    "  run [om]     run an om — interactive picker if no om is given, else by name or file path",
    "  ls           list the discovered oms and actions",
    "  check        typecheck the project (tsc --noEmit)",
    "  init         scaffold a starter project (tsconfig.omkit.json + sample oms/ and actions/)",
    "  help         show this help",
    "",
    "Flags:",
    "  --tsconfig <path>   project config to scan (default: tsconfig.omkit.json)",
    "  --json              machine-readable output (ls)",
    "  --inspect[=port]    run the om in a forked child with the Node inspector open (default port 9229)",
    "  -h, --help          show this help",
    "",
    "A bare `omkit` opens the interactive picker (run is the default command).",
  ].join("\n");
}
