export type TaskStatus = "todo" | "in-progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export enum TaskPhase {
  Draft = "draft",
  Active = "active",
  Closed = "closed",
}

export const taskDefaults = {
  pagination: { defaultLimit: 25, maxLimit: 100 },
  notifications: { enabled: true, channels: { email: true, slack: false } },
} as const;

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

export interface ProjectSettings {
  archive?: {
    retentionDays: number;
    purgeOnDelete?: boolean;
  };
}

export interface CreateTaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeId?: string;
  projectId: string;
}
