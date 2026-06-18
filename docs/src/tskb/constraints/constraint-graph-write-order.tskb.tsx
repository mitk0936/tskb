import { Doc, P, ref } from "tskb";

const WriteSplitGraph = ref as tskb.Exports["writeSplitGraph"];
const BuildCommand = ref as tskb.Modules["cli.commands.build"];
const ServeExplorer = ref as tskb.Exports["explorer.serveExplorer"];
const ServerModule = ref as tskb.Modules["explorer.server"];

export default (
  <Doc
    explains="Why must the graph writer write meta.json last and atomically?"
    priority="constraint"
  >
    <P>
      {WriteSplitGraph} must write every graph file atomically (write a temp file, then rename it
      into place) and must write <code>meta.json</code> <strong>last</strong>. A running{" "}
      {ServeExplorer} keys its reload detection off <code>meta.json</code>'s mtime: a changed mtime
      is taken to mean a complete new graph is on disk, so the server reloads and rebuilds its chunk
      cache. Writing <code>meta.json</code> last makes that signal trustworthy — every other file is
      already in place by the time its mtime moves.
    </P>
    <P>
      The server in {ServerModule} polls <code>meta.json</code>'s mtime rather than watching the
      directory, because {BuildCommand} deletes and recreates the whole <code>.tskb/</code>{" "}
      directory on every build — a directory watch bound to the old directory goes dead the moment
      it is removed. If <code>meta.json</code> were written first, or non-atomically, a reload could
      read a half-written or partial graph and serve broken chunks. Keep <code>meta.json</code> as
      the final write.
    </P>
  </Doc>
);
