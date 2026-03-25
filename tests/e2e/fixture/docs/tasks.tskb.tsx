import { Doc, H1, P, Relation, ref } from "tskb";

const TaskService = ref as tskb.Exports["TaskService"];
const ProjectService = ref as tskb.Exports["ProjectService"];
const ServicesFolder = ref as tskb.Folders["services"];
const TaskWorkflow = ref as tskb.Terms["task-workflow"];

export default (
  <Doc
    explains="Task and project management: creation, assignment, status workflow"
    priority="supplementary"
  >
    <H1>Task Management</H1>

    <P>
      {TaskService} and {ProjectService} in {ServicesFolder} handle the core domain. Tasks follow{" "}
      {TaskWorkflow} — they move through statuses as work progresses.
    </P>

    <Relation from={TaskService} to={ProjectService} label="tasks belong to projects" />
  </Doc>
);
