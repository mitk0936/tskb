import { ApiError, ResponseMetadata } from "examples/taskflow-app/src/shared/types/api.types.js";
import { Doc, H1, H2, P, List, Li, Snippet, ref } from "tskb";

export default (
  <Doc>
    <H1>Constraint: API Response Structure</H1>

    <P>
      All API endpoints MUST return responses following the ApiResponse type defined in{" "}
      {ref as tskb.Folders["Types"]}. This ensures consistent error handling and response structure
      across the entire API.
    </P>

    <H2>Required Structure</H2>

    <Snippet
      code={() => {
        interface ApiResponse<T> {
          data: T; // Actual response payload
          error?: ApiError; // Error details if request failed
          meta?: ResponseMetadata; // Optional metadata (timestamps, request ID)
        }
      }}
    />

    <H2>Success Response Example</H2>

    <Snippet
      code={() => {
        // GET /api/tasks/123
        JSON.stringify({
          data: {
            id: "123",
            title: "Implement login",
            status: "in-progress",
            // ... rest of task data
          },
          meta: {
            timestamp: "2026-01-24T10:30:00Z",
            requestId: "req_abc123",
          },
        });
      }}
    />

    <H2>Error Response Example</H2>

    <Snippet
      code={() => {
        // POST /api/tasks (validation failure)
        JSON.stringify({
          data: null,
          error: {
            code: "VALIDATION_ERROR",
            message: "Title is required",
            details: {
              field: "title",
              constraint: "minLength",
            },
          },
          meta: {
            timestamp: "2026-01-24T10:30:00Z",
          },
        });
      }}
    />

    <H2>Pagination Responses</H2>

    <P>
      List endpoints returning multiple items MUST use PaginatedResponse type for consistency with{" "}
      {ref as tskb.Terms["pagination"]}.
    </P>

    <Snippet
      code={() => {
        interface PaginatedResponse<T> {
          items: T[]; // Array of items for current page
          total: number; // Total count across all pages
          page: number; // Current page number
          limit: number; // Items per page
          totalPages: number; // Calculated total pages
        }
      }}
    />

    <H2>Enforcement</H2>

    <List>
      <Li>Controllers must use typed response helpers that enforce structure</Li>
      <Li>
        {ref as tskb.Exports["ErrorHandler"]} middleware ensures errors follow ApiResponse format
      </Li>
      <Li>Client {ref as tskb.Exports["ApiClient"]} expects and validates this structure</Li>
      <Li>End-to-end type safety from server through client</Li>
    </List>

    <H2>Benefits</H2>

    <List>
      <Li>Predictable error handling on client side</Li>
      <Li>Consistent metadata for debugging and logging</Li>
      <Li>TypeScript catches response structure violations at compile time</Li>
      <Li>Easy to add global response transformations</Li>
    </List>
  </Doc>
);
