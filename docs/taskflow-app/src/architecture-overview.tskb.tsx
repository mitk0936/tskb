import { Doc, H1, H2, H3, P, List, Li, Snippet, ref } from "tskb";

import { useAuth } from "examples/taskflow-app/src/client/contexts/AuthContext.js";
import { Database, DatabaseConfig } from "examples/taskflow-app/src/server/database/connection.js";
import { TaskRepository } from "examples/taskflow-app/src/server/database/repositories/task.repository.js";
import {
  FilterParams,
  PaginatedResponse,
  PaginationParams,
} from "examples/taskflow-app/src/shared/types/api.types.js";
import { Task } from "examples/taskflow-app/src/shared/types/task.types.js";

export default (
  <Doc>
    <H1>TaskFlow Architecture Overview</H1>

    <P>
      TaskFlow is a full-stack task management application demonstrating modern web architecture
      patterns. The application follows a clean separation between {ref as tskb.Folders["Client"]},{" "}
      {ref as tskb.Folders["Server"]}, and {ref as tskb.Folders["Shared"]} code.
    </P>

    <H2>Core Architecture</H2>

    <H3>Three-Layer Structure</H3>

    <List>
      <Li>
        Client Layer - React frontend located in {ref as tskb.Folders["Client"]} handles user
        interface, state management via {ref as tskb.Terms["contextProvider"]}, and API
        communication.
      </Li>
      <Li>
        Server Layer - Node.js backend in {ref as tskb.Folders["Server"]} implements the{" "}
        {ref as tskb.Terms["serviceLayer"]} pattern with controllers, services, and the{" "}
        {ref as tskb.Terms["repositoryPattern"]}.
      </Li>
      <Li>
        Shared Layer - TypeScript types in {ref as tskb.Folders["Shared"]} ensure type safety across
        the entire stack.
      </Li>
    </List>

    <H2>Backend Architecture</H2>

    <P>The server follows a layered architecture with clear separation of concerns:</P>

    <List>
      <Li>
        {ref as tskb.Folders["Controllers"]} - Handle HTTP requests and responses, delegating
        business logic to services
      </Li>
      <Li>
        {ref as tskb.Folders["Services"]} - Implement core business logic using the{" "}
        {ref as tskb.Terms["serviceLayer"]} pattern
      </Li>
      <Li>
        {ref as tskb.Folders["Repositories"]} - Abstract database operations following the{" "}
        {ref as tskb.Terms["repositoryPattern"]}
      </Li>
      <Li>
        {ref as tskb.Folders["Middleware"]} - Process requests through a{" "}
        {ref as tskb.Terms["middlewareChain"]} for auth, validation, and errors
      </Li>
    </List>

    <H3>Key Services</H3>

    <P>
      The {ref as tskb.Exports["TaskService"]} is the central module for task management, supporting{" "}
      {ref as tskb.Terms["crudOperations"]}, status updates, and filtering with{" "}
      {ref as tskb.Terms["pagination"]}.
    </P>

    <Snippet
      code={() => {
        class TaskService {
          taskRepository = new TaskRepository(new Database({} as DatabaseConfig));

          async getByProject(
            projectId: string,
            pagination?: PaginationParams,
            filters?: FilterParams
          ): Promise<PaginatedResponse<Task>> {
            // Delegates to repository
            const { tasks, total } = await this.taskRepository.findByProject(
              projectId,
              pagination,
              filters
            );
            const page = pagination?.page || 1;
            const limit = pagination?.limit || 20;
            return {
              items: tasks,
              total,
              page,
              limit,
              totalPages: Math.ceil(total / limit),
            };
          }
        }
      }}
    />

    <H2>Frontend Architecture</H2>

    <P>
      The client application uses React with Context API for state management. Key organizational
      patterns:
    </P>

    <List>
      <Li>
        {ref as tskb.Folders["Pages"]} - Route-level components organized by feature (auth,
        projects, tasks)
      </Li>
      <Li>{ref as tskb.Folders["Components"]} - Reusable UI components grouped by domain</Li>
      <Li>
        {ref as tskb.Folders["Contexts"]} - Global state providers using{" "}
        {ref as tskb.Terms["contextProvider"]} pattern
      </Li>
      <Li>{ref as tskb.Folders["Hooks"]} - Custom hooks for shared client-side logic</Li>
      <Li>{ref as tskb.Folders["ClientServices"]} - API clients for backend communication</Li>
    </List>

    <H3>State Management</H3>

    <P>
      Authentication state is managed by {ref as tskb.Exports["AuthContext"]}, which provides
      login/logout functionality and user information to all components. The context uses{" "}
      {ref as tskb.Terms["jwt"]} tokens for authentication.
    </P>

    <Snippet
      code={() => {
        function MyComponent() {
          const { user, login, logout } = useAuth();
          const email = "user@example.com";
          const password = "password123";

          return user ? (
            <div>Welcome, {user.name}</div>
          ) : (
            <button onClick={() => login(email, password)}>Login</button>
          );
        }
      }}
    />

    <H2>Data Flow</H2>

    <P>The typical request flow through the application:</P>

    <List>
      <Li>User interacts with React component in {ref as tskb.Folders["Pages"]}</Li>
      <Li>Component calls {ref as tskb.Exports["ApiClient"]} to send HTTP request</Li>
      <Li>Request passes through {ref as tskb.Exports["AuthMiddleware"]} for authentication</Li>
      <Li>Controller receives request and calls appropriate service</Li>
      <Li>Service implements business logic and calls repository</Li>
      <Li>Repository queries database and returns data</Li>
      <Li>Response flows back through layers to client</Li>
      <Li>Context updates state and React re-renders UI</Li>
    </List>

    <H2>Type Safety</H2>

    <P>
      The {ref as tskb.Folders["Types"]} folder contains all shared type definitions, ensuring
      end-to-end type safety. Types are organized by domain: user.types, task.types, project.types,
      etc.
    </P>

    <P>
      Common types like ApiResponse and PaginatedResponse provide consistent structure for API
      communication.
    </P>
  </Doc>
);
