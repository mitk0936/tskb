import { Doc, H1, H2, P, Relation, ref } from "tskb";

const Api = ref as tskb.Folders["api"];
const Services = ref as tskb.Folders["services"];
const Models = ref as tskb.Folders["models"];
const Utils = ref as tskb.Folders["utils"];
const Postgres = ref as tskb.Externals["postgres"];

export default (
  <Doc
    explains="Top-level architecture: API → Services → Models with PostgreSQL storage"
    priority="essential"
  >
    <H1>Architecture Overview</H1>

    <P>
      The application follows a layered architecture. {Api} handles HTTP routing, delegates to{" "}
      {Services} for business logic, which operates on {Models} types. Data is persisted in{" "}
      {Postgres}.
    </P>

    <H2>Layers</H2>
    <P>{Utils} provides cross-cutting concerns like logging used across all layers.</P>

    <Relation from={Api} to={Services} label="delegates to" />
    <Relation from={Services} to={Postgres} label="persists to" />
  </Doc>
);
