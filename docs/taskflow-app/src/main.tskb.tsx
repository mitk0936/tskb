import { Doc, H1, H2, P, List, Li, ref } from "tskb";

const ClientFolder = ref as tskb.Folders["Client"];
const ServerFolder = ref as tskb.Folders["Server"];
const SharedFolder = ref as tskb.Folders["Shared"];

const RepositoryPatternTerm = ref as tskb.Terms["repositoryPattern"];
const ServiceLayerTerm = ref as tskb.Terms["serviceLayer"];
const ContextProviderTerm = ref as tskb.Terms["contextProvider"];
const JwtTerm = ref as tskb.Terms["jwt"];

export default (
  <Doc>
    <H1>TaskFlow Application</H1>

    <P>
      Full-stack task management application demonstrating modern web architecture patterns.
      Three-layer separation: {ClientFolder} (React), {ServerFolder} (Node.js),
      {SharedFolder} (TypeScript types).
    </P>

    <H2>Architecture Layers</H2>

    <List>
      <Li>
        {ClientFolder}: React frontend with {ContextProviderTerm} for state, hooks for data
        fetching, WebSocket for real-time updates. Details in client-overview.
      </Li>
      <Li>
        {ServerFolder}: Node.js backend with {ServiceLayerTerm} and {RepositoryPatternTerm}.
        Controllers, services, repositories, middleware. Details in server-overview.
      </Li>
      <Li>
        {SharedFolder}: Type definitions shared across client/server ensuring end-to-end type
        safety. API contracts, domain types.
      </Li>
    </List>

    <H2>Core Patterns</H2>

    <List>
      <Li>
        {RepositoryPatternTerm}: Abstract data access through repository interfaces. Details in
        data-layer.
      </Li>
      <Li>{ServiceLayerTerm}: Business logic isolated from HTTP and data layers.</Li>
      <Li>
        {ContextProviderTerm}: React Context for state management instead of Redux. See
        adr-context-over-redux.
      </Li>
      <Li>
        {JwtTerm}: Token-based authentication with refresh flow. Details in authentication-system.
      </Li>
    </List>

    <H2>Technology Stack</H2>

    <List>
      <Li>Frontend: React, TypeScript, Vite</Li>
      <Li>Backend: Node.js, Express, PostgreSQL</Li>
      <Li>Real-time: WebSocket for notifications and live updates</Li>
      <Li>Type Safety: Shared TypeScript types across full stack</Li>
    </List>

    <H2>Domain Models</H2>

    <List>
      <Li>Tasks: Core entity with status, priority, assignments. See task-domain.</Li>
      <Li>Projects: Workspace organization with team management. See project-domain.</Li>
      <Li>Authentication: User auth with JWT tokens. See auth-domain.</Li>
      <Li>Notifications: Real-time updates via WebSocket. See notification-domain.</Li>
    </List>

    <H2>Documentation Navigation</H2>

    <List>
      <Li>High-Level: architecture-overview for complete architectural picture</Li>
      <Li>Client: client-overview for frontend architecture and patterns</Li>
      <Li>Server: server-overview for backend layering and request flow</Li>
      <Li>Data: data-layer for repository pattern implementation</Li>
      <Li>Auth: authentication-system for auth flow and JWT handling</Li>
      <Li>Decisions: adr/ folder for architectural decision records</Li>
      <Li>Rules: constraints/ folder for enforced architectural constraints</Li>
    </List>
  </Doc>
);
