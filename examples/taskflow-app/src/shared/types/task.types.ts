export interface Task {
  id: string;
  title: string;
  description?: string;
  projectId: string;
  assigneeId?: string;
  reporterId: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  estimatedHours?: number;
  actualHours?: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export enum TaskStatus {
  Backlog = "backlog",
  Todo = "todo",
  InProgress = "in-progress",
  InReview = "in-review",
  Done = "done",
  Cancelled = "cancelled",
}

export enum TaskPriority {
  Low = "low",
  Medium = "medium",
  High = "high",
  Urgent = "urgent",
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TaskActivity {
  id: string;
  taskId: string;
  userId: string;
  action: TaskAction;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export enum TaskAction {
  Created = "created",
  Updated = "updated",
  StatusChanged = "status-changed",
  AssigneeChanged = "assignee-changed",
  Commented = "commented",
  Deleted = "deleted",
}
