// External writer for tail-log.test.ts: opens the log ONCE and keeps the handle open (like a
// long-running server), appending `<prefix>-<i>` lines in ticks of `burst`, then stays alive
// until killed. Prints "done" on stdout after the last write.
// Usage: node held-writer.mjs <file> <prefix> <count> <intervalMs> <burst>
import fs from "node:fs";

const [file, prefix, count, interval, burst] = process.argv.slice(2);
const n = Number(count);
const perTick = Number(burst);
const fd = fs.openSync(file, "a");
let i = 0;
const timer = setInterval(() => {
  for (let b = 0; b < perTick && i < n; b++, i++) fs.writeSync(fd, `${prefix}-${i}\n`);
  if (i >= n) {
    clearInterval(timer);
    process.stdout.write("done\n");
  }
}, Number(interval));
setInterval(() => {}, 1 << 30);
