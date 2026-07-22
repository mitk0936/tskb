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

const RunFolderTerm = ref as tskb.Terms["run-folder"];

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
    </List>

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
  </Doc>
);
