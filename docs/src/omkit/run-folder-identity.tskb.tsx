import { type Module, type Export, Doc, H1, H2, P, List, Li, Relation, ref } from "tskb";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Modules {
      "omkit.foundation.ids": Module<{
        desc: "Id and hash helpers: node ids, short ids, and the run-identity hash.";
        type: typeof import("packages/omkit/src/foundation/ids.js");
      }>;

      "omkit.foundation.callsite": Module<{
        desc: "Captures the file:line of a caller from the V8 stack — the source of a run's defining file.";
        type: typeof import("packages/omkit/src/foundation/callsite.js");
      }>;
    }

    interface Exports {
      "omkit.omHash": Export<{
        desc: "A run's stable identity: the first 8 hex of sha256 over the defining file plus the om name.";
        type: typeof import("packages/omkit/src/foundation/ids.js").omHash;
      }>;

      "omkit.callerSite": Export<{
        desc: "The file:line of the site that launched the run — captured from the call stack, not from process.argv.";
        type: typeof import("packages/omkit/src/foundation/callsite.js").callerSite;
      }>;

      "omkit.siteFile": Export<{
        desc: "Strips the :line off a call site, leaving just the file — so moving a call within its file keeps identity stable.";
        type: typeof import("packages/omkit/src/foundation/callsite.js").siteFile;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const IdsModule = ref as tskb.Modules["omkit.foundation.ids"];
const CallsiteModule = ref as tskb.Modules["omkit.foundation.callsite"];

const OmExport = ref as tskb.Exports["omkit.om"];
const OmHashExport = ref as tskb.Exports["omkit.omHash"];
const CallerSiteExport = ref as tskb.Exports["omkit.callerSite"];
const SiteFileExport = ref as tskb.Exports["omkit.siteFile"];
const RunFolderModule = ref as tskb.Modules["omkit.output.run-folder"];

const CreateClientExport = ref as tskb.Exports["omkit.createOmkitClient"];
const McpToolsModule = ref as tskb.Modules["omkit.mcp.tools"];

const RunFolderTerm = ref as tskb.Terms["run-folder"];
const Vitest = ref as tskb.Externals["vitest"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc
    explains="Why is a run folder's identity keyed by the om's name and its defining file?"
    priority="constraint"
  >
    <H1>Run folder identity</H1>
    <P>
      Every run writes to a {RunFolderTerm} at <code>logs/&lt;name&gt;-&lt;hash8&gt;/</code>. The{" "}
      <code>&lt;hash8&gt;</code> is {OmHashExport} over two inputs, and two inputs only: the{" "}
      {OmExport}'s name and the absolute path of the file that defines it. The defining file is
      captured from the call stack by {CallerSiteExport}, never from <code>process.argv</code> or
      the entry script.
    </P>

    <Relation from={OmExport} to={OmHashExport} label="keys its run folder by" />
    <Relation from={OmHashExport} to={CallerSiteExport} label="hashes the file captured by" />
    <Relation from={RunFolderModule} to={OmHashExport} label="names the folder from" />

    <H2>The rules</H2>
    <List>
      <Li>
        <strong>Key on (file, name), not name alone.</strong> The same name in two different files
        must resolve to two different folders — consumers routinely define same-named oms across
        folders.
      </Li>
      <Li>
        <strong>Stable across runs.</strong> The same file and name must hash the same on every run,
        so a script or an assistant can always find "the latest run of X" without parsing
        scrollback.
      </Li>
      <Li>
        <strong>Drop the line number.</strong> {SiteFileExport} strips the <code>:line</code> before
        hashing, so moving the call within its file does not change the run's identity.
      </Li>
      <Li>
        <strong>
          Never derive identity from <code>process.argv</code>.
        </strong>{" "}
        Identity is a property of where the run is <em>defined</em>, not how the process was
        launched.
      </Li>
      <Li>
        <strong>The folder's parent is the project, not the process.</strong> Which{" "}
        <code>logs/</code> a run writes into is named explicitly by whoever starts it, through{" "}
        <code>OMKIT_ROOT</code> — never read off the working directory.
      </Li>
    </List>

    <H2>Which logs/ the folder lands in</H2>
    <P>
      Identity names the folder; the project names its parent. {RunFolderModule} resolves{" "}
      <code>logs/</code> against <code>OMKIT_ROOT</code>, which {CreateClientExport} sets to the
      directory owning the config it was built from, and which {McpToolsModule} sets to the root
      that same server serves its resources from — so a run an assistant starts and a run started
      from a terminal land in one tree, and each can read the other's record.
    </P>
    <P>
      Reading the working directory instead is what scattered them. A run's cwd is not a statement
      about which project it belongs to: a bare run sets it to the om file's own directory, so that
      relative paths written in a body resolve the way their author reads them. A project with oms
      in several folders therefore grew a <code>logs/</code> tree beside each one, while the server
      wrote to wherever it happened to be launched — one om, several lineages, and the "latest run
      of X" guarantee above silently answering from whichever half the asker was standing in. The
      cwd still means what it meant; only the record's location is a property of the project.
    </P>

    <Relation from={CreateClientExport} to={RunFolderModule} label="names the root of" />

    <H2>What breaks if you get it wrong</H2>
    <P>
      Key on the name alone and two pipelines both named <code>dev</code> in different packages
      clobber each other's history — you can no longer tell their runs apart or diff them. Derive
      the identity from the entry script (<code>process.argv</code>) instead of the defining file,
      and wrapping or moving the launcher scatters one pipeline's runs across folders — the "find
      the latest run of X" guarantee that an assistant relies on quietly breaks. Hash the line
      number in and every edit above the <code>om()</code> call forks the run's history into a fresh
      folder.
    </P>
    <P>
      The hash and the call-site capture live in {IdsModule} and {CallsiteModule}. Change either and
      you change what "the same run" means — so treat this identity as a contract, not an
      implementation detail.
    </P>

    <H2>Known caveat: on Windows, one om can own two lineages</H2>
    <P>
      The hash is taken over the raw call-site string, and {SiteFileExport} only strips the{" "}
      <code>:line</code> — it does not normalise path separators. A V8 stack frame reports whichever
      style the runner produced, so on Windows the same file can hash two ways: {Vitest} reports
      forward slashes, while launching the om directly through the TypeScript runner reports
      backslashes. The om then owns two run-folder lineages, split by nothing but how it was
      started, and "the latest run of X" sees only half its history.
    </P>
    <P>
      This is a known limitation, recorded rather than fixed. Normalising the separator inside{" "}
      {SiteFileExport} would change what {OmHashExport} returns for every om on a Windows machine,
      orphaning every run folder already on disk — a deliberate migration, not a drive-by fix. It
      does not affect POSIX systems, which have only one separator. If you do fix it, treat it as a
      change to this contract and re-key the existing folders on purpose.
    </P>
  </Doc>
);
