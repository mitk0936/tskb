// Sends COUNT messages up the fork IPC channel as fast as it can, then `done` — the raw
// transport shape of a chatty supervised run, with no omkit in the way.
const count = Number(process.argv[2] ?? 1000);
for (let i = 0; i < count; i++) process.send({ kind: "tick", i });
process.send({ kind: "done" }, () => process.disconnect());
