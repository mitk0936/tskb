import { createContext, useContext } from "react";
import { Task } from "../../shared/types";

export interface TaskContextValue {
  tasks: Task[];
  isLoading: boolean;
  loadTasks: (projectId: string) => Promise<void>;
  createTask: (data: any) => Promise<Task>;
  updateTask: (id: string, data: any) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  assignTask: (id: string, assigneeId: string) => Promise<void>;
  updateTaskStatus: (id: string, status: string) => Promise<void>;
}

export const TaskContext = createContext<TaskContextValue | null>(null);

export function TaskProvider({ children }: { children: React.ReactNode }) {
  return null;
}

export function useTask(): TaskContextValue {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error("useTask must be used within TaskProvider");
  }
  return context;
}
