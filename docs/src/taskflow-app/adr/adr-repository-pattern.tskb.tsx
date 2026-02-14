import { Doc, H1, H2, H3, P, List, Li, Snippet, ref } from "tskb";
import { Task } from "examples/taskflow-app/src/shared/types/task.types.js";
import { Database } from "examples/taskflow-app/src/server/database/connection.js";

const ServicesFolder = ref as tskb.Folders["Services"];
const RepositoriesFolder = ref as tskb.Folders["Repositories"];

const ServiceLayerTerm = ref as tskb.Terms["serviceLayer"];
const RepositoryPatternTerm = ref as tskb.Terms["repositoryPattern"];
const CrudOperationsTerm = ref as tskb.Terms["crudOperations"];
const DependencyInjectionTerm = ref as tskb.Terms["dependencyInjection"];

const TaskServiceExport = ref as tskb.Exports["TaskService"];
const TaskRepositoryExport = ref as tskb.Exports["TaskRepository"];

export default (
  <Doc explains="ADR: choosing repository pattern over direct database access or full ORM">
    <H1>ADR: Repository Pattern Over Direct Database Access</H1>

    <H2>Status</H2>
    <P>Accepted</P>

    <H2>Context</H2>

    <P>
      We needed to decide how the {ServiceLayerTerm} in {ServicesFolder}
      should interact with the database. Options considered:
    </P>

    <List>
      <Li>Services write SQL queries directly</Li>
      <Li>Use an ORM (e.g., TypeORM, Prisma)</Li>
      <Li>Implement the {ref as tskb.Terms["repositoryPattern"]}</Li>
    </List>

    <H2>Decision</H2>

    <P>
      We will implement the {RepositoryPatternTerm} with repository classes in
      {RepositoriesFolder}. Each domain entity (Task, User, Project) gets its own repository.
    </P>

    <H3>Repository Responsibilities</H3>

    <List>
      <Li>Execute database queries (SQL or ORM calls)</Li>
      <Li>Map database rows to TypeScript types</Li>
      <Li>Handle pagination and filtering</Li>
      <Li>Ensure parameterized queries to prevent SQL injection</Li>
      <Li>Provide clean API for {CrudOperationsTerm}</Li>
    </List>

    <H3>Service Responsibilities</H3>

    <List>
      <Li>Implement business logic and validation rules</Li>
      <Li>Orchestrate operations across multiple repositories</Li>
      <Li>Trigger side effects (notifications, logging)</Li>
      <Li>Handle transactions when needed</Li>
    </List>

    <H2>Consequences</H2>

    <H3>Positive</H3>

    <List>
      <Li>
        <strong>Testability:</strong> Services can be tested with mocked repositories without a
        database
      </Li>
      <Li>
        <strong>Separation of Concerns:</strong> Business logic (services) decoupled from data
        access (repositories)
      </Li>
      <Li>
        <strong>Flexibility:</strong> Database can be changed by updating repositories only
      </Li>
      <Li>
        <strong>Reusability:</strong> Common queries (findById, findAll) centralized in one place
      </Li>
      <Li>
        <strong>Security:</strong> Repositories enforce parameterized queries, preventing SQL
        injection
      </Li>
    </List>

    <H3>Negative</H3>

    <List>
      <Li>
        <strong>Boilerplate:</strong> More classes and files compared to services writing SQL
        directly
      </Li>
      <Li>
        <strong>Indirection:</strong> One more layer to understand when tracing code
      </Li>
      <Li>
        <strong>Learning Curve:</strong> Developers must understand the pattern
      </Li>
    </List>

    <H2>Implementation Example</H2>

    <P>
      The {TaskServiceExport} uses {TaskRepositoryExport} through
      {DependencyInjectionTerm}.
    </P>

    <Snippet
      code={() => {
        // Service uses repository abstraction
        class TaskService {
          constructor(private taskRepository: TaskRepository) {}

          async assignTask(taskId: string, assigneeId: string): Promise<Task> {
            // Business logic
            const task = await this.taskRepository.findById(taskId);
            if (!task) throw new Error("Task not found");

            // Delegate persistence to repository
            return this.taskRepository.update(taskId, { assigneeId });
          }
        }

        // Repository handles database details
        class TaskRepository {
          constructor(private db: Database) {}

          async findById(id: string): Promise<Task | null> {
            const query = "SELECT * FROM tasks WHERE id = ?";
            const result = await this.db.query<Task>(query, [id]);
            return result[0] || null;
          }

          async update(id: string, data: Partial<Task>): Promise<Task> {
            const query = "UPDATE tasks SET assignee_id = ? WHERE id = ?";
            await this.db.execute(query, [data.assigneeId, id]);
            const updated = await this.findById(id);
            if (!updated) throw new Error("Task not found after update");
            return updated;
          }
        }
      }}
    />

    <H2>Alternatives Considered</H2>

    <H3>1. Services Write SQL Directly</H3>

    <List>
      <Li>Pro: Fewer classes, less abstraction</Li>
      <Li>Con: Business logic mixed with data access</Li>
      <Li>Con: Difficult to test without database</Li>
      <Li>Con: SQL scattered across codebase</Li>
    </List>

    <H3>2. Use Full ORM (TypeORM/Prisma)</H3>

    <List>
      <Li>Pro: Less boilerplate, auto-migrations</Li>
      <Li>Pro: Type-safe query builders</Li>
      <Li>Con: Learning curve for ORM-specific APIs</Li>
      <Li>Con: Magic behavior can be hard to debug</Li>
      <Li>Con: Performance overhead for simple queries</Li>
    </List>

    <H2>References</H2>

    <List>
      <Li>Martin Fowler - Patterns of Enterprise Application Architecture</Li>
      <Li>Clean Architecture by Robert C. Martin</Li>
      <Li>Repository pattern in Domain-Driven Design</Li>
    </List>
  </Doc>
);
