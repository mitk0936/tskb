export interface Project {
  id: string;
  name: string;
  description?: string;
  teamId: string;
  ownerId: string;
  status: ProjectStatus;
  startDate?: Date;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProjectStatus {
  Planning = "planning",
  Active = "active",
  OnHold = "on-hold",
  Completed = "completed",
  Archived = "archived",
}

export interface ProjectMember {
  userId: string;
  projectId: string;
  role: "owner" | "contributor" | "viewer";
  addedAt: Date;
}
