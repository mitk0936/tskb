import { Doc, H1, H2, P, Flow, Step, ref } from "tskb";

const AuthServiceExport = ref as tskb.Exports["AuthService"];
const AuthMiddlewareExport = ref as tskb.Exports["AuthMiddleware"];
const Database = ref as tskb.Exports["Database"];
const TaskServiceExport = ref as tskb.Exports["TaskService"];
const TaskRepositoryExport = ref as tskb.Exports["TaskRepository"];
const NotificationServiceExport = ref as tskb.Exports["NotificationService"];

export default (
  <Doc explains="Core application flows: authentication and task creation sequences">
    <H1>Application Flows</H1>

    <H2>Login</H2>
    <P>User authentication from HTTP request through service layer to database and back.</P>
    <Flow name="login-flow" desc="User authentication from HTTP request to session token">
      <Step node={AuthMiddlewareExport} label="Validates request format" />
      <Step node={AuthServiceExport} label="Checks credentials, generates JWT" />
      <Step node={Database} label="Queries user record" />
    </Flow>

    <H2>Task Creation</H2>
    <P>Creating a new task with validation, persistence, and notification dispatch.</P>
    <Flow name="task-creation" desc="Task creation with validation and notification">
      <Step node={TaskServiceExport} label="Validates input, applies business rules" />
      <Step node={TaskRepositoryExport} label="Persists task to database" />
      <Step node={NotificationServiceExport} label="Notifies assigned users" />
    </Flow>
  </Doc>
);
