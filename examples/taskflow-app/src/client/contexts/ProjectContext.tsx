import { createContext, useContext } from "react";
import { Project } from "../../shared/types";

export interface ProjectContextValue {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
  loadProjects: () => Promise<void>;
  selectProject: (id: string) => void;
  createProject: (data: any) => Promise<Project>;
  updateProject: (id: string, data: any) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  return null;
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProject must be used within ProjectProvider");
  }
  return context;
}
