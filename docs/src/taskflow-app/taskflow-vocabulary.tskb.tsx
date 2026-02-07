import type { Export, Folder, Module, Term } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      Client: Folder<{
        desc: "React frontend application with components, pages, and state management";
        path: "examples/taskflow-app/src/client";
      }>;
      Server: Folder<{
        desc: "Node.js backend API with services, controllers, and middleware";
        path: "examples/taskflow-app/src/server";
      }>;
      Shared: Folder<{
        desc: "Shared TypeScript types and utilities used by both client and server";
        path: "examples/taskflow-app/src/shared";
      }>;

      // Client subdirectories
      Components: Folder<{
        desc: "Reusable React components organized by feature";
        path: "examples/taskflow-app/src/client/components";
      }>;
      Pages: Folder<{
        desc: "Top-level page components mapped to routes";
        path: "examples/taskflow-app/src/client/pages";
      }>;
      Contexts: Folder<{
        desc: "React Context providers for global state management";
        path: "examples/taskflow-app/src/client/contexts";
      }>;
      Hooks: Folder<{
        desc: "Custom React hooks for shared logic";
        path: "examples/taskflow-app/src/client/hooks";
      }>;
      ClientServices: Folder<{
        desc: "API client services for backend communication";
        path: "examples/taskflow-app/src/client/services";
      }>;

      // Server subdirectories
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

      // Shared subdirectories
      Types: Folder<{
        desc: "TypeScript type definitions shared across the application";
        path: "examples/taskflow-app/src/shared/types";
      }>;
      Utils: Folder<{
        desc: "Utility functions for validation, formatting, and common operations";
        path: "examples/taskflow-app/src/shared/utils";
      }>;
      Config: Folder<{
        desc: "Configuration constants and environment variables";
        path: "examples/taskflow-app/src/shared/config";
      }>;
    }

    interface Modules {
      // Concrete modules representing actual code exports
      AuthService: Module<{
        desc: "Handles user authentication, registration, and token management";
        type: typeof import("examples/taskflow-app/src/server/services/auth.service.js");
      }>;
      TaskRepository: Module<{
        desc: "Data access layer for task persistence with pagination and filtering";
        type: typeof import("examples/taskflow-app/src/server/database/repositories/task.repository.js");
      }>;
      AuthContext: Module<{
        desc: "React Context providing authentication state and login/logout methods";
        type: typeof import("examples/taskflow-app/src/client/contexts/AuthContext.js");
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

      // Client Contexts
      AuthContext: Export<{
        desc: "React Context providing authentication state and login/logout methods";
        type: typeof import("examples/taskflow-app/src/client/contexts/AuthContext.js").AuthContext;
      }>;
      TaskContext: Export<{
        desc: "React Context managing task state and CRUD operations";
        type: typeof import("examples/taskflow-app/src/client/contexts/TaskContext.js").TaskContext;
      }>;
      ProjectContext: Export<{
        desc: "React Context for project selection and management";
        type: typeof import("examples/taskflow-app/src/client/contexts/ProjectContext.js").ProjectContext;
      }>;

      WebSocketService: Export<{
        desc: "Real-time communication service for live updates";
        type: import("examples/taskflow-app/src/client/services/websocket.service.js").WebSocketService;
      }>;

      ErrorHandler: Export<{
        desc: "Global error handling middleware for consistent API responses";
        type: typeof import("examples/taskflow-app/src/server/middleware/error.middleware.js").errorHandler;
      }>;

      // Database
      Database: Export<{
        desc: "Database connection manager with query execution and transaction support";
        type: typeof import("examples/taskflow-app/src/server/database/connection.js").Database;
      }>;

      // Shared Types
      Task: Export<{
        desc: "Task entity type with status, priority, and assignment properties";
        type: import("examples/taskflow-app/src/shared/types/task.types.js").Task;
      }>;
      Project: Export<{
        desc: "Project entity type with team and status information";
        type: import("examples/taskflow-app/src/shared/types/project.types.js").Project;
      }>;
      PaginationParams: Export<{
        desc: "Pagination parameters for list queries (page, limit, sorting)";
        type: import("examples/taskflow-app/src/shared/types/api.types.js").PaginationParams;
      }>;
      FilterParams: Export<{
        desc: "Filter parameters for querying tasks by status, priority, date range, etc.";
        type: import("examples/taskflow-app/src/shared/types/api.types.js").FilterParams;
      }>;
      ApiResponse: Export<{
        desc: "Standard API response wrapper with data, error, and metadata fields";
        type: import("examples/taskflow-app/src/shared/types/api.types.js").ApiResponse<{}>;
      }>;
      PaginatedResponse: Export<{
        desc: "Generic paginated response with items, total count, and page metadata";
        type: import("examples/taskflow-app/src/shared/types/api.types.js").PaginatedResponse<{}>;
      }>;
    }

    interface Terms {
      repositoryPattern: Term<"Data access abstraction layer that separates business logic from database operations">;
      serviceLayer: Term<"Business logic layer that orchestrates operations between controllers and repositories">;
      contextProvider: Term<"React pattern for managing and sharing state across component tree without prop drilling">;
      jwt: Term<"JSON Web Token - stateless authentication mechanism using signed tokens">;
      pagination: Term<"Technique for splitting large datasets into smaller pages for efficient data transfer">;
      middlewareChain: Term<"Sequential processing pattern where request passes through multiple handlers">;
      dependencyInjection: Term<"Design pattern where dependencies are provided to a class rather than created internally">;
      crudOperations: Term<"Create, Read, Update, Delete - fundamental data operations">;
      typeGuards: Term<"TypeScript runtime checks that narrow types within conditional blocks">;
    }
  }
}

export {};
