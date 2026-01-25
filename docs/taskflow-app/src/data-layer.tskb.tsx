import { Database } from "examples/taskflow-app/src/server/database/connection.js";
import { TaskRepository } from "examples/taskflow-app/src/server/database/repositories/task.repository.js";
import { NotificationService } from "examples/taskflow-app/src/server/services/notification.service.js";
import {
  FilterParams,
  PaginationParams,
} from "examples/taskflow-app/src/shared/types/api.types.js";
import { Task } from "examples/taskflow-app/src/shared/types/task.types.js";
import { PAGINATION_DEFAULT_LIMIT } from "examples/taskflow-app/src/shared/config/constants.js";
import { Doc, H1, H2, H3, P, List, Li, Snippet, ref } from "tskb";
import type { Export, Folder, Term } from "tskb";

// Declare vocabulary needed for this document
declare global {
  namespace tskb {
    interface Exports {
      Database: Export<{
        desc: "Database connection manager with query execution and transaction support";
        type: typeof import("examples/taskflow-app/src/server/database/connection.js").Database;
      }>;
      TaskRepository: Export<{
        desc: "Data access layer for task persistence with pagination and filtering";
        type: typeof import("examples/taskflow-app/src/server/database/repositories/task.repository.js").TaskRepository;
      }>;
      TaskService: Export<{
        desc: "Manages task CRUD operations, status updates, and assignments";
        type: typeof import("examples/taskflow-app/src/server/services/task.service.js").TaskService;
      }>;
      NotificationService: Export<{
        desc: "Creates and delivers notifications for task updates and mentions";
        type: typeof import("examples/taskflow-app/src/server/services/notification.service.js").NotificationService;
      }>;
      Task: Export<{
        desc: "Task entity type with status, priority, and assignment properties";
        type: import("examples/taskflow-app/src/shared/types/task.types.js").Task;
      }>;
      User: Export<{
        desc: "User entity type with authentication and profile information";
        type: import("examples/taskflow-app/src/shared/types/user.types.js").User;
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
      PaginatedResponse: Export<{
        desc: "Generic paginated response with items, total count, and page metadata";
        type: import("examples/taskflow-app/src/shared/types/api.types.js").PaginatedResponse<{}>;
      }>;
    }

    interface Folders {
      Database: Folder<{
        desc: "Database connection and repository layer for data persistence";
        path: "examples/taskflow-app/src/server/database";
      }>;
      Repositories: Folder<{
        desc: "Data access layer abstracting database operations";
        path: "examples/taskflow-app/src/server/database/repositories";
      }>;
      Types: Folder<{
        desc: "TypeScript type definitions shared across the application";
        path: "examples/taskflow-app/src/shared/types";
      }>;
    }

    interface Terms {
      repositoryPattern: Term<"Data access abstraction layer that separates business logic from database operations">;
      crudOperations: Term<"Create, Read, Update, Delete - fundamental data operations">;
      pagination: Term<"Technique for splitting large datasets into smaller pages for efficient data transfer">;
      dependencyInjection: Term<"Design pattern where dependencies are provided to a class rather than created internally">;
    }
  }
}

export default (
  <Doc>
    <H1>Data Layer Architecture</H1>

    <P>
      The data layer implements the {ref as tskb.Terms["repositoryPattern"]} to separate database
      operations from business logic. This architecture provides clean abstraction and makes the
      code testable and maintainable.
    </P>

    <H2>Repository Pattern</H2>

    <P>
      All database access goes through repository classes in {ref as tskb.Folders["Repositories"]}.
      Repositories provide a clean API for {ref as tskb.Terms["crudOperations"]} without exposing
      database implementation details.
    </P>

    <H3>TaskRepository Example</H3>

    <P>
      The {ref as tskb.Exports["TaskRepository"]} demonstrates the pattern with support for
      {ref as tskb.Terms["pagination"]} and filtering. It uses{" "}
      {ref as tskb.Exports["PaginationParams"]}
      and {ref as tskb.Exports["FilterParams"]} from the shared types to ensure consistency.
    </P>

    <Snippet
      code={() => {
        class TaskRepository {
          constructor(private db: Database) {}

          async findByProject(
            projectId: string,
            pagination?: PaginationParams,
            filters?: FilterParams
          ): Promise<{ tasks: Task[]; total: number }> {
            // 1. Build SQL query with filters
            let query = "SELECT * FROM tasks WHERE project_id = ?";
            const params: any[] = [projectId];

            // 2. Apply filters
            if (filters?.status) {
              query += " AND status IN (?)";
              params.push(...filters.status);
            }

            // 3. Apply pagination
            const limit = pagination?.limit || PAGINATION_DEFAULT_LIMIT;
            const offset = ((pagination?.page || 1) - 1) * limit;
            query += " LIMIT ? OFFSET ?";
            params.push(limit, offset);

            // 4. Execute query
            const tasks = await this.db.query<Task>(query, params);
            const total = await this.countByProject(projectId, filters);

            return { tasks, total };
          }

          private async countByProject(projectId: string, filters?: FilterParams): Promise<number> {
            let query = "SELECT COUNT(*) as count FROM tasks WHERE project_id = ?";
            const params: any[] = [projectId];

            if (filters?.status) {
              query += " AND status IN (?)";
              params.push(...filters.status);
            }

            const result = await this.db.query<{ count: number }>(query, params);
            return result[0]?.count || 0;
          }
        }
      }}
    />

    <H3>Repository Benefits</H3>

    <List>
      <Li>Services don't know about SQL - they call clean repository methods</Li>
      <Li>Database can be swapped (Postgres → MySQL) by updating repositories only</Li>
      <Li>Easy to mock repositories for unit testing services</Li>
      <Li>Prevents SQL injection through parameterized queries</Li>
      <Li>Centralizes data access logic and validation</Li>
    </List>

    <H2>Service Layer Integration</H2>

    <P>
      Services like {ref as tskb.Exports["TaskService"]} use{" "}
      {ref as tskb.Terms["dependencyInjection"]}
      to receive repository instances, keeping the layers decoupled. The service works with the
      {ref as tskb.Exports["Task"]} type and delegates persistence to{" "}
      {ref as tskb.Exports["TaskRepository"]}.
    </P>

    <Snippet
      code={() => {
        class TaskService {
          constructor(
            private taskRepository: TaskRepository,
            private notificationService: NotificationService
          ) {}

          async create(taskData: Omit<Task, "id" | "createdAt" | "updatedAt">): Promise<Task> {
            // 1. Business logic validation
            if (!taskData.title || taskData.title.length < 3) {
              throw new Error("Title must be at least 3 characters");
            }

            // 2. Delegate to repository
            const task = await this.taskRepository.create(taskData);

            // 3. Trigger side effects
            if (task.assigneeId) {
              await this.notificationService.sendTaskAssignedNotification(task.id, task.assigneeId);
            }

            return task;
          }
        }
      }}
    />

    <H2>Database Connection</H2>

    <P>
      The {ref as tskb.Exports["Database"]} class in {ref as tskb.Folders["Database"]} manages the
      connection pool and provides query methods with transaction support. All repositories receive
      a Database instance via {ref as tskb.Terms["dependencyInjection"]}.
    </P>

    <Snippet
      code={() => {
        class Database {
          private pool: any; // Connection pool instance

          async transaction<T>(callback: () => Promise<T>): Promise<T> {
            const client = await this.pool.connect();

            try {
              await client.query("BEGIN");
              const result = await callback();
              await client.query("COMMIT");
              return result;
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            } finally {
              client.release();
            }
          }
        }
      }}
    />

    <H2>Pagination Implementation</H2>

    <P>
      {ref as tskb.Terms["pagination"]} is implemented consistently across all repositories using
      shared types from {ref as tskb.Folders["Types"]}. The{" "}
      {ref as tskb.Exports["PaginationParams"]}
      type defines the input, and {ref as tskb.Exports["PaginatedResponse"]} wraps the output.
    </P>

    <List>
      <Li>PaginationParams defines page number and limit</Li>
      <Li>PaginatedResponse includes items, total count, and metadata</Li>
      <Li>Default limit is 20 items, maximum is 100 (from constants)</Li>
      <Li>Repositories calculate offset from page number: (page - 1) * limit</Li>
    </List>

    <H2>Data Validation</H2>

    <P>
      Type safety is enforced at multiple levels using TypeScript types like{" "}
      {ref as tskb.Exports["Task"]},{ref as tskb.Exports["User"]}, and{" "}
      {ref as tskb.Exports["Project"]}:
    </P>

    <List>
      <Li>TypeScript interfaces define expected data shapes</Li>
      <Li>Repositories validate required fields before INSERT/UPDATE</Li>
      <Li>Services apply business rules and constraints</Li>
      <Li>Controllers use validation middleware before reaching services</Li>
    </List>
  </Doc>
);
