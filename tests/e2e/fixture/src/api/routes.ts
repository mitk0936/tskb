export interface RouteDefinition {
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: string;
  auth: boolean;
}

export const routes: RouteDefinition[] = [
  { method: "POST", path: "/auth/login", handler: "authLogin", auth: false },
  { method: "POST", path: "/auth/register", handler: "authRegister", auth: false },
  { method: "GET", path: "/tasks", handler: "listTasks", auth: true },
  { method: "POST", path: "/tasks", handler: "createTask", auth: true },
  { method: "PATCH", path: "/tasks/:id/status", handler: "updateTaskStatus", auth: true },
  { method: "GET", path: "/projects", handler: "listProjects", auth: true },
  { method: "POST", path: "/projects", handler: "createProject", auth: true },
];
