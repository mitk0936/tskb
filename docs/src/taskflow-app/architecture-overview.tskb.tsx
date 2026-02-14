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

const ClientFolder = ref as tskb.Folders["Client"];
const ServerFolder = ref as tskb.Folders["Server"];
const SharedFolder = ref as tskb.Folders["Shared"];
const ControllersFolder = ref as tskb.Folders["Controllers"];
const ServicesFolder = ref as tskb.Folders["Services"];
const RepositoriesFolder = ref as tskb.Folders["Repositories"];
const MiddlewareFolder = ref as tskb.Folders["Middleware"];
const PagesFolder = ref as tskb.Folders["Pages"];
const ComponentsFolder = ref as tskb.Folders["Components"];
const ContextsFolder = ref as tskb.Folders["Contexts"];
const HooksFolder = ref as tskb.Folders["Hooks"];
const ClientServicesFolder = ref as tskb.Folders["ClientServices"];
const TypesFolder = ref as tskb.Folders["Types"];

const ContextProviderTerm = ref as tskb.Terms["contextProvider"];
const ServiceLayerTerm = ref as tskb.Terms["serviceLayer"];
const RepositoryPatternTerm = ref as tskb.Terms["repositoryPattern"];
const MiddlewareChainTerm = ref as tskb.Terms["middlewareChain"];
const CrudOperationsTerm = ref as tskb.Terms["crudOperations"];
const PaginationTerm = ref as tskb.Terms["pagination"];
const JwtTerm = ref as tskb.Terms["jwt"];

const TaskServiceExport = ref as tskb.Exports["TaskService"];
const AuthContextExport = ref as tskb.Exports["AuthContext"];
const ApiClientExport = ref as tskb.Exports["ApiClient"];
const AuthMiddlewareExport = ref as tskb.Exports["AuthMiddleware"];

export default (
  <Doc explains="Full architectural overview of TaskFlow: layers, data flow, and type safety">
    <H1>TaskFlow Architecture Overview</H1>

    <P>
      TaskFlow is a full-stack task management application demonstrating modern web architecture
      patterns. The application follows a clean separation between {ClientFolder}, {ServerFolder},
      and {SharedFolder} code.
    </P>

    <H2>Core Architecture</H2>

    <H3>Three-Layer Structure</H3>

    <List>
      <Li>
        Client Layer - React frontend located in {ClientFolder} handles user interface, state
        management via {ContextProviderTerm}, and API communication.
      </Li>
      <Li>
        Server Layer - Node.js backend in {ServerFolder} implements the {ServiceLayerTerm} pattern
        with controllers, services, and the {RepositoryPatternTerm}.
      </Li>
      <Li>
        Shared Layer - TypeScript types in {SharedFolder} ensure type safety across the entire
        stack.
      </Li>
    </List>

    <H2>Backend Architecture</H2>

    <P>The server follows a layered architecture with clear separation of concerns:</P>

    <List>
      <Li>
        {ControllersFolder} - Handle HTTP requests and responses, delegating business logic to
        services
      </Li>
      <Li>
        {ServicesFolder} - Implement core business logic using the {ServiceLayerTerm} pattern
      </Li>
      <Li>
        {RepositoriesFolder} - Abstract database operations following the {RepositoryPatternTerm}
      </Li>
      <Li>
        {MiddlewareFolder} - Process requests through a {MiddlewareChainTerm} for auth, validation,
        and errors
      </Li>
    </List>

    <H3>Key Services</H3>

    <P>
      The {TaskServiceExport} is the central module for task management, supporting{" "}
      {CrudOperationsTerm}, status updates, and filtering with {PaginationTerm}.
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
      <Li>{PagesFolder} - Route-level components organized by feature (auth, projects, tasks)</Li>
      <Li>{ComponentsFolder} - Reusable UI components grouped by domain</Li>
      <Li>
        {ContextsFolder} - Global state providers using {ContextProviderTerm} pattern
      </Li>
      <Li>{HooksFolder} - Custom hooks for shared client-side logic</Li>
      <Li>{ClientServicesFolder} - API clients for backend communication</Li>
    </List>

    <H3>State Management</H3>

    <P>
      Authentication state is managed by {AuthContextExport}, which provides login/logout
      functionality and user information to all components. The context uses {JwtTerm} tokens for
      authentication.
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
      <Li>User interacts with React component in {PagesFolder}</Li>
      <Li>Component calls {ApiClientExport} to send HTTP request</Li>
      <Li>Request passes through {AuthMiddlewareExport} for authentication</Li>
      <Li>Controller receives request and calls appropriate service</Li>
      <Li>Service implements business logic and calls repository</Li>
      <Li>Repository queries database and returns data</Li>
      <Li>Response flows back through layers to client</Li>
      <Li>Context updates state and React re-renders UI</Li>
    </List>

    <H2>Type Safety</H2>

    <P>
      The {TypesFolder} folder contains all shared type definitions, ensuring end-to-end type
      safety. Types are organized by domain: user.types, task.types, project.types, etc.
    </P>

    <P>
      Common types like ApiResponse and PaginatedResponse provide consistent structure for API
      communication.
    </P>
  </Doc>
);
