import { Doc, H1, P, Relation, ref, val, type DotPath } from "tskb";
import { TaskPhase, taskDefaults, type TaskStatus } from "../src/models/task.js";

const TaskService = ref as tskb.Exports["TaskService"];
const ProjectService = ref as tskb.Exports["ProjectService"];
const ServicesFolder = ref as tskb.Folders["services"];
const TaskWorkflow = ref as tskb.Terms["task-workflow"];
const TodoStatus = val as Extract<TaskStatus, "todo">;
const DoneStatus = val as Extract<TaskStatus, "done">;
const DraftPhase = val as typeof TaskPhase.Draft;
const PageLimitPath = val as DotPath<typeof taskDefaults, ["pagination", "defaultLimit"]>;
const SlackChannelPath = val as DotPath<
  typeof taskDefaults,
  ["notifications", "channels", "slack"]
>;

export default (
  <Doc
    explains="Task and project management: creation, assignment, status workflow"
    priority="supplementary"
  >
    <H1>Task Management</H1>

    <P>
      {TaskService} and {ProjectService} in {ServicesFolder} handle the core domain. Tasks follow{" "}
      {TaskWorkflow} — they move through <strong>statuses</strong> as work progresses.
    </P>
    <P>
      Status values are written as <code>todo</code>, <code>in_progress</code>, <code>done</code>.
      Press <kbd>Ctrl</kbd>+<kbd>K</kbd> to search.
      <br />
      Deprecated names are shown with <del>strikethrough</del>; renames as <em>italics</em>.
    </P>
    <P>
      New tasks start in the <code>{DraftPhase}</code> phase as <code>{TodoStatus}</code> and finish
      as <code>{DoneStatus}</code>.
    </P>
    <P>
      Pagination default lives at <code>{PageLimitPath}</code>; the Slack channel toggle is at{" "}
      <code>{SlackChannelPath}</code>.
    </P>

    <Relation from={TaskService} to={ProjectService} label="tasks belong to projects" />
  </Doc>
);
