export type TaskStatus = "todo" | "in-progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  projectId: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId?: string;
  projectId: string;
}
