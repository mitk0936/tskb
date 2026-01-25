import { createContext, useState, useContext } from "react";
import { Doc, H1, H2, H3, P, List, Li, Snippet, ref } from "tskb";
import { CommentForm } from "examples/taskflow-app/src/client/components/comments/CommentForm.js";
import { User } from "examples/taskflow-app/src/shared/types/user.types.js";

export default (
  <Doc>
    <H1>ADR: React Context Over Redux for State Management</H1>

    <H2>Status</H2>
    <P>Accepted</P>

    <H2>Context</H2>

    <P>
      The {ref as tskb.Folders["Client"]} needed a state management solution for sharing
      authentication status, current project, and task lists across components.
    </P>

    <P>Options considered:</P>
    <List>
      <Li>React Context API with hooks</Li>
      <Li>Redux with Redux Toolkit</Li>
      <Li>MobX</Li>
      <Li>Zustand</Li>
      <Li>Prop drilling (no state management library)</Li>
    </List>

    <H2>Decision</H2>

    <P>
      Use React Context API with custom hooks, implementing the{" "}
      {ref as tskb.Terms["contextProvider"]}
      pattern. Create separate contexts in {ref as tskb.Folders["Contexts"]} for different domains
      (Auth, Tasks, Projects, Notifications).
    </P>

    <H2>Implementation Pattern</H2>

    <P>The {ref as tskb.Exports["AuthContext"]} demonstrates the pattern:</P>

    <Snippet
      code={() => {
        return <CommentForm onSubmit={() => {}} />;
      }}
    />

    <Snippet
      code={() => {
        // 1. Create context with typed interface
        interface AuthContextValue {
          user: User | null;
          isAuthenticated: boolean;
          login: (email: string, password: string) => Promise<void>;
          logout: () => Promise<void>;
        }

        const AuthContext = createContext<AuthContextValue | null>(null);

        // 2. Provider component manages state
        function AuthProvider({ children }: { children: React.ReactNode }) {
          const [user, setUser] = useState<User | null>(null);

          const login = async (email: string, password: string) => {
            // Simulated API call
            const response = await fetch("/api/auth/login", {
              method: "POST",
              body: JSON.stringify({ email, password }),
            });
            const data = await response.json();
            setUser(data.user);
          };

          const logout = async () => {
            await fetch("/api/auth/logout", { method: "POST" });
            setUser(null);
          };

          const isAuthenticated = user !== null;

          return (
            <AuthContext.Provider value={{ user, isAuthenticated, login, logout }}>
              {children}
            </AuthContext.Provider>
          );
        }

        // 3. Custom hook for consuming context
        function useAuth() {
          const context = useContext(AuthContext);
          if (!context) throw new Error("useAuth must be within AuthProvider");
          return context;
        }
      }}
    />

    <H2>Consequences</H2>

    <H3>Positive</H3>

    <List>
      <Li>
        <strong>Built-in:</strong> No additional dependencies, uses React's native API
      </Li>
      <Li>
        <strong>Simple:</strong> Easy to understand for developers familiar with React hooks
      </Li>
      <Li>
        <strong>Type-safe:</strong> Full TypeScript support without additional setup
      </Li>
      <Li>
        <strong>Flexible:</strong> Can create multiple contexts for different domains
      </Li>
      <Li>
        <strong>Performance:</strong> Components only re-render when their context changes
      </Li>
    </List>

    <H3>Negative</H3>

    <List>
      <Li>
        <strong>No DevTools:</strong> Unlike Redux, no time-travel debugging out of the box
      </Li>
      <Li>
        <strong>Boilerplate:</strong> Each context requires provider, hook, and interface
        definitions
      </Li>
      <Li>
        <strong>Re-render Optimization:</strong> Need to manually optimize with useMemo/useCallback
      </Li>
      <Li>
        <strong>Testing:</strong> Need to wrap components with providers in tests
      </Li>
    </List>

    <H2>Context Organization</H2>

    <P>Separate contexts by domain to minimize unnecessary re-renders:</P>

    <List>
      <Li>{ref as tskb.Exports["AuthContext"]} - User authentication state</Li>
      <Li>{ref as tskb.Exports["TaskContext"]} - Current project's tasks</Li>
      <Li>{ref as tskb.Exports["ProjectContext"]} - Project list and selection</Li>
      <Li>NotificationContext - User notifications and alerts</Li>
    </List>

    <H2>When to Use Redux Instead</H2>

    <P>Consider Redux if the application grows to have:</P>

    <List>
      <Li>Complex state with many interdependent updates</Li>
      <Li>Need for time-travel debugging</Li>
      <Li>Advanced middleware requirements (sagas, etc.)</Li>
      <Li>Large team requiring strict state update patterns</Li>
      <Li>Extensive client-side caching needs</Li>
    </List>

    <H2>Migration Path</H2>

    <P>If we need Redux later, migration is straightforward:</P>

    <List>
      <Li>Context interfaces become Redux state slices</Li>
      <Li>Context actions become Redux actions/thunks</Li>
      <Li>Custom hooks (useAuth, useTask) can wrap Redux hooks</Li>
      <Li>Component code remains largely unchanged</Li>
    </List>

    <H2>References</H2>

    <List>
      <Li>React Context API documentation</Li>
      <Li>When to use Context vs Redux - Mark Erikson</Li>
      <Li>Application State Management with React - Kent C. Dodds</Li>
    </List>
  </Doc>
);
