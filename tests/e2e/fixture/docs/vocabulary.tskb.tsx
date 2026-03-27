import type { Folder, Module, Export, External, Term } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      api: Folder<{ desc: "HTTP routes and middleware"; path: "src/api" }>;
      services: Folder<{ desc: "Business logic layer"; path: "src/services" }>;
      models: Folder<{ desc: "Data models and type definitions"; path: "src/models" }>;
      utils: Folder<{ desc: "Shared utilities"; path: "src/utils" }>;
    }

    interface Modules {
      "services.auth": Module<{
        desc: "Authentication and authorization service";
        type: typeof import("../src/services/auth.service.js");
      }>;
      "services.task": Module<{
        desc: "Task management service";
        type: typeof import("../src/services/task.service.js");
      }>;
      "services.project": Module<{
        desc: "Project management service";
        type: typeof import("../src/services/project.service.js");
      }>;
      "api.routes": Module<{
        desc: "API route definitions";
        type: typeof import("../src/api/routes.js");
      }>;
      "utils.logger": Module<{
        desc: "Structured logging utility";
        type: typeof import("../src/utils/logger.js");
      }>;
      /** Barrel module — intentionally shares ID with the utils Folder */
      utils: Module<{
        desc: "Utils barrel re-exporting all utilities";
        type: typeof import("../src/utils/index.js");
      }>;
    }

    interface Exports {
      AuthService: Export<{
        desc: "Handles login, registration, and token management";
        type: typeof import("../src/services/auth.service.js").AuthService;
      }>;
      TaskService: Export<{
        desc: "CRUD operations for tasks with status workflow";
        type: typeof import("../src/services/task.service.js").TaskService;
      }>;
      ProjectService: Export<{
        desc: "Project creation and membership management";
        type: typeof import("../src/services/project.service.js").ProjectService;
      }>;
      createLogger: Export<{
        desc: "Factory for structured loggers";
        type: typeof import("../src/utils/logger.js").createLogger;
      }>;
    }

    interface Externals {
      postgres: External<{
        desc: "Primary relational database";
        kind: "database";
      }>;
    }

    interface Terms {
      jwt: Term<"JSON Web Tokens for stateless authentication">;
      rbac: Term<"Role-based access control (admin, member, viewer)">;
      "task-workflow": Term<"Task status transitions: todo → in-progress → done/cancelled">;
    }
  }
}

export {};
