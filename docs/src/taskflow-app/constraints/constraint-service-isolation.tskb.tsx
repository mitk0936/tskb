import { Doc, H1, H2, P, List, Li, ref } from "tskb";

const ServicesFolder = ref as tskb.Folders["Services"];
const RepositoriesFolder = ref as tskb.Folders["Repositories"];

const DependencyInjectionTerm = ref as tskb.Terms["dependencyInjection"];

const TaskServiceExport = ref as tskb.Exports["TaskService"];

export default (
  <Doc>
    <H1>Constraint: Service Layer Isolation</H1>

    <P>
      Services in {ServicesFolder} MUST NOT directly access the database. All data persistence
      operations MUST go through repositories in {RepositoriesFolder}.
    </P>

    <H2>Rationale</H2>

    <List>
      <Li>Maintains separation of concerns between business logic and data access</Li>
      <Li>Enables swapping database implementations without changing services</Li>
      <Li>Facilitates testing by allowing repository mocking</Li>
      <Li>Prevents SQL injection and enforces parameterized queries</Li>
      <Li>Centralizes data access patterns and optimizations</Li>
    </List>

    <H2>Correct Pattern</H2>

    <P>Services receive repository instances via {DependencyInjectionTerm} in the constructor.</P>

    <P>✅ Good Example:</P>
    <List>
      <Li>{TaskServiceExport} accepts TaskRepository in constructor</Li>
      <Li>Service calls repository.findById() instead of writing SQL</Li>
      <Li>Repository handles all database interaction details</Li>
    </List>

    <P>❌ Anti-pattern:</P>
    <List>
      <Li>Service imports Database class directly</Li>
      <Li>Service writes raw SQL queries</Li>
      <Li>Service accesses database connection pool</Li>
    </List>

    <H2>Enforcement</H2>

    <List>
      <Li>Code reviews should flag direct database access in services</Li>
      <Li>Import linting can prevent importing Database in service files</Li>
      <Li>All database operations should be traceable to a repository method</Li>
    </List>
  </Doc>
);
