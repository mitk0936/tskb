import type { Export, Folder } from "tskb";

declare global {
  namespace tskb {
    interface Folders {
      Components: Folder<{
        desc: "Reusable React components organized by feature";
        path: "examples/taskflow-app/src/client/components";
      }>;
      Pages: Folder<{
        desc: "Top-level page components mapped to routes";
        path: "examples/taskflow-app/src/client/pages";
      }>;
      Contexts: Folder<{
        desc: "React Context providers for global state management";
        path: "examples/taskflow-app/src/client/contexts";
      }>;
      Hooks: Folder<{
        desc: "Custom React hooks for shared logic";
        path: "examples/taskflow-app/src/client/hooks";
      }>;
      ClientServices: Folder<{
        desc: "API client services for backend communication";
        path: "examples/taskflow-app/src/client/services";
      }>;
    }

    interface Exports {
      // Client Contexts
      AuthContext: Export<{
        desc: "React Context providing authentication state and login/logout methods";
        type: typeof import("examples/taskflow-app/src/client/contexts/AuthContext.js").AuthContext;
      }>;
      TaskContext: Export<{
        desc: "React Context managing task state and CRUD operations";
        type: typeof import("examples/taskflow-app/src/client/contexts/TaskContext.js").TaskContext;
      }>;
      ProjectContext: Export<{
        desc: "React Context for project selection and management";
        type: typeof import("examples/taskflow-app/src/client/contexts/ProjectContext.js").ProjectContext;
      }>;

      // Client Services
      WebSocketService: Export<{
        desc: "Real-time communication service for live updates";
        type: import("examples/taskflow-app/src/client/services/websocket.service.js").WebSocketService;
      }>;
    }
  }
}

export {};
