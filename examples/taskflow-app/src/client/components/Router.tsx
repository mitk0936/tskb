import { LoginPage } from "../pages/auth/LoginPage";
import { RegisterPage } from "../pages/auth/RegisterPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ProjectListPage } from "../pages/projects/ProjectListPage";
import { ProjectDetailPage } from "../pages/projects/ProjectDetailPage";
import { TaskBoardPage } from "../pages/tasks/TaskBoardPage";
import { TaskDetailPage } from "../pages/tasks/TaskDetailPage";

export interface Route {
  path: string;
  component: () => JSX.Element;
  protected?: boolean;
}

const routes: Route[] = [
  { path: "/login", component: LoginPage, protected: false },
  { path: "/register", component: RegisterPage, protected: false },
  { path: "/", component: DashboardPage, protected: true },
  { path: "/projects", component: ProjectListPage, protected: true },
  { path: "/projects/:id", component: ProjectDetailPage, protected: true },
  { path: "/tasks", component: TaskBoardPage, protected: true },
  { path: "/tasks/:id", component: TaskDetailPage, protected: true },
];

export function Router() {
  const currentPath = window.location.pathname;

  const matchRoute = (path: string): boolean => {
    const pathPattern = path.replace(/:\w+/g, "[^/]+");
    const regex = new RegExp(`^${pathPattern}$`);
    return regex.test(currentPath);
  };

  const route = routes.find((r) => matchRoute(r.path));

  if (!route) {
    return <div>404 - Page not found</div>;
  }

  const Component = route.component;
  return <Component />;
}
