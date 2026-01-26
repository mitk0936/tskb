# TaskFlow Application

Full-stack task management app: React + Express + WebSocket.

## Documentation

Architecture docs: `../../docs/taskflow-app/src/`
Knowledge graph: `../../docs/taskflow-app/dist/taskflow-graph.json`

## Key Patterns

- Client: React Context for state (not Redux)
- Server: Repository pattern for data access
- Real-time: WebSocket for live updates

See ADRs and constraints in docs for architectural decisions.
