import type { Export, Folder, Module } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      Services: Folder<{
        desc: "Business logic layer handling core application operations";
        path: "examples/taskflow-app/src/server/services";
      }>;
      Controllers: Folder<{
        desc: "HTTP request handlers that coordinate between routes and services";
        path: "examples/taskflow-app/src/server/controllers";
      }>;
      Middleware: Folder<{
        desc: "Express middleware for authentication, validation, and error handling";
        path: "examples/taskflow-app/src/server/middleware";
      }>;
      Database: Folder<{
        desc: "Database connection and repository layer for data persistence";
        path: "examples/taskflow-app/src/server/database";
      }>;
      Repositories: Folder<{
        desc: "Data access layer abstracting database operations";
        path: "examples/taskflow-app/src/server/database/repositories";
      }>;
    }

    interface Modules {
      AuthService: Module<{
        desc: "Handles user authentication, registration, and token management";
        type: typeof import("examples/taskflow-app/src/server/services/auth.service.js");
      }>;
      TaskRepository: Module<{
        desc: "Data access layer for task persistence with pagination and filtering";
        type: typeof import("examples/taskflow-app/src/server/database/repositories/task.repository.js");
      }>;
    }

    interface Exports {
      // Server Services
      AuthService: Export<{
        desc: "Handles user authentication, registration, and token management";
        type: typeof import("examples/taskflow-app/src/server/services/auth.service.js").AuthService;
      }>;
      TaskService: Export<{
        desc: "Manages task CRUD operations, status updates, and assignments";
        type: typeof import("examples/taskflow-app/src/server/services/task.service.js").TaskService;
      }>;
      ProjectService: Export<{
        desc: "Handles project lifecycle, team assignments, and member management";
        type: typeof import("examples/taskflow-app/src/server/services/project.service.js").ProjectService;
      }>;
      UserService: Export<{
        desc: "Manages user profiles and team memberships";
        type: typeof import("examples/taskflow-app/src/server/services/user.service.js").UserService;
      }>;
      NotificationService: Export<{
        desc: "Creates and delivers notifications for task updates and mentions";
        type: typeof import("examples/taskflow-app/src/server/services/notification.service.js").NotificationService;
      }>;

      // Repositories
      TaskRepository: Export<{
        desc: "Data access layer for task persistence with pagination and filtering";
        type: typeof import("examples/taskflow-app/src/server/database/repositories/task.repository.js").TaskRepository;
      }>;
      UserRepository: Export<{
        desc: "Data access layer for user CRUD operations";
        type: typeof import("examples/taskflow-app/src/server/database/repositories/user.repository.js").UserRepository;
      }>;
      ProjectRepository: Export<{
        desc: "Data access layer for project data persistence";
        type: typeof import("examples/taskflow-app/src/server/database/repositories/project.repository.js").ProjectRepository;
      }>;

      // Middleware
      ErrorHandler: Export<{
        desc: "Global error handling middleware for consistent API responses";
        type: typeof import("examples/taskflow-app/src/server/middleware/error.middleware.js").errorHandler;
      }>;

      // Database
      Database: Export<{
        desc: "Database connection manager with query execution and transaction support";
        type: typeof import("examples/taskflow-app/src/server/database/connection.js").Database;
      }>;
    }
  }
}

export {};
