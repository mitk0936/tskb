import { ApiError, ResponseMetadata } from "examples/taskflow-app/src/shared/types/api.types.js";
import { Doc, H1, H2, P, List, Li, Snippet, ref } from "tskb";

const TypesFolder = ref as tskb.Folders["Types"];

const PaginationTerm = ref as tskb.Terms["pagination"];

const ErrorHandlerExport = ref as tskb.Exports["ErrorHandler"];
const ApiClientExport = ref as tskb.Exports["ApiClient"];

export default (
  <Doc explains="Constraint: all API endpoints must follow the ApiResponse type structure">
    <H1>Constraint: API Response Structure</H1>

    <P>
      All API endpoints MUST return responses following the ApiResponse type defined in{" "}
      {TypesFolder}. This ensures consistent error handling and response structure across the entire
      API.
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
      {PaginationTerm}.
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
      <Li>{ErrorHandlerExport} middleware ensures errors follow ApiResponse format</Li>
      <Li>Client {ApiClientExport} expects and validates this structure</Li>
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
