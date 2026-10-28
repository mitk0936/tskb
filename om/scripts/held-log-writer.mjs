// External log writer for the tailLog:experiment om. Mimics a long-running server: opens the
// log once, appends `line-<i>` every intervalMs (mirroring each to stdout), then keeps the
// handle open until killed — the case where Windows stops delivering directory notifications.
// Usage: node held-log-writer.mjs <file> <count> <intervalMs> [burst]
import fs from "node:fs";

const [file, count = "40", interval = "50", burst = "1"] = process.argv.slice(2);
const n = Number(count);
const perTick = Number(burst);
const fd = fs.openSync(file, "a");
let i = 0;
const timer = setInterval(() => {
  for (let b = 0; b < perTick && i < n; b++, i++) {
    fs.writeSync(fd, `line-${i}\n`);
    console.log(`wrote line-${i}`);
  }
  if (i >= n) clearInterval(timer);
}, Number(interval));
// Stay alive (fd open) until the run tears us down.
setInterval(() => {}, 1 << 30);
