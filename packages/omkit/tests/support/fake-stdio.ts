import { PassThrough, Writable } from "node:stream";

/**
 * Run `body` with stdin/stdout swapped for in-memory streams, so the bare-terminal path can be
 * driven without a TTY and without the prompt text reaching the reporter. `body` receives the
 * fake stdin to type into — a `PassThrough` buffers whatever is written before readline attaches,
 * so it can be written to at any point. Resolves with everything written to the fake stdout.
 *
 * The fake stdin reports `isTTY: true`, because "someone is at a terminal" is what the runtime
 * checks before it is willing to prompt at all (`isInteractive()` in `om.ts`). It does not make
 * readline enter terminal mode — that is inferred from the *output* stream, which is a plain
 * `Writable` here, so lines arrive exactly as they would through a pipe.
 *
 * Note what this harness deliberately does **not** do: it never ends the stream. A real terminal
 * has no EOF, so a test that closes stdin can pass against a prompt that only ever terminates on
 * end-of-input — which is precisely the bug class this exists to catch. Callers write lines and
 * leave the stream open.
 */
export async function withFakeStdio(body: (stdin: PassThrough) => Promise<void>): Promise<string> {
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = true;
  let written = "";
  const stdout = new Writable({
    write(chunk, _enc, cb) {
      written += String(chunk);
      cb();
    },
  });
  const realStdin = Object.getOwnPropertyDescriptor(process, "stdin")!;
  const realStdout = Object.getOwnPropertyDescriptor(process, "stdout")!;
  Object.defineProperty(process, "stdin", { value: stdin, configurable: true });
  Object.defineProperty(process, "stdout", { value: stdout, configurable: true });
  try {
    await body(stdin);
  } finally {
    Object.defineProperty(process, "stdin", realStdin);
    Object.defineProperty(process, "stdout", realStdout);
  }
  return written;
}
