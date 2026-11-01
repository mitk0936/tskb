import { type Export, Doc, H1, P, List, Li, Relation, Snippet, ref } from "tskb";
import { om } from "packages/omkit/src/index.js";

// ─── Registry ─────────────────────────────────────────────────────────────────

declare global {
  namespace tskb {
    interface Exports {
      "omkit.OmDescription": Export<{
        desc: "What .describe() takes on an om or action: a required summary plus any further props.";
        type: import("packages/omkit/src/core/types.js").OmDescription;
      }>;
      "omkit.detailsOf": Export<{
        desc: "Reads the props of a .describe() call from the source, besides summary, without running it.";
        type: typeof import("packages/omkit/src/client/outline.js").detailsOf;
      }>;
    }
  }
}

// ─── Refs ─────────────────────────────────────────────────────────────────────

const OmDescription = ref as tskb.Exports["omkit.OmDescription"];
const DetailsOf = ref as tskb.Exports["omkit.detailsOf"];
const DiscoveryModule = ref as tskb.Modules["omkit.client.discovery"];
const OmListModule = ref as tskb.Modules["omkit.cli.ui.om-list"];
const WriteResultExport = ref as tskb.Exports["omkit.writeResult"];
const ReportWriterModule = ref as tskb.Modules["omkit.output.writers.report"];

// ─── Documentation ────────────────────────────────────────────────────────────

export default (
  <Doc explains="What can .describe() hold, and where does it show up?" priority="supplementary">
    <H1>Describing an om or action</H1>
    <P>
      {OmDescription} needs a <code>summary</code>. You can add any other props, such as an owner, a
      docs link, or what the om needs. Values can be strings, numbers, booleans, or lists of
      strings.
    </P>
    <P>
      A few prop names are suggested and typed: <code>needs</code>, <code>sideEffects</code>,{" "}
      <code>writes</code>, <code>owner</code> and <code>docs</code>. Using them keeps descriptions
      consistent across projects. The summary is always stored as one line: newlines and indentation
      collapse to single spaces, so a multi-line template literal is fine.
    </P>
    <P>
      On an action, a literal summary is also part of the type: the last type argument of{" "}
      <code>Action</code> and <code>Activity</code>, cleaned to one line the same way. Hovering the
      action, a call to it, or the activity it returns shows the summary in the editor. A computed
      summary shows as <code>string</code>.
    </P>
    <Snippet
      code={() => {
        // A summary plus two extra props. Both extra props are literals, so the picker shows them.
        om("dev").describe({
          summary: "Start the dev stack",
          owner: "web team",
          needs: ["docker", "node 22"],
        });
      }}
    />
    <P>Where it shows up:</P>
    <List>
      <Li>
        The summary: <code>omkit ls --describe</code>, the skill file, MCP, the picker, and the
        report.
      </Li>
      <Li>The other props: the picker and the report.</Li>
    </List>
    <P>
      The picker and the report read the description in different ways. {DiscoveryModule} reads it
      from the source with {DetailsOf}, without running anything. So the picker shows only literal
      values. A prop set from a variable is left out. The report shows the description recorded when
      the run happened, so it has every value.
    </P>

    <Relation from={DiscoveryModule} to={DetailsOf} label="reads describe props with" />
    <Relation from={OmListModule} to={OmDescription} label="shows literal props of" />
    <Relation from={WriteResultExport} to={OmDescription} label="records each node's" />
    <Relation from={ReportWriterModule} to={OmDescription} label="lists every prop of" />
  </Doc>
);
