export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: "task" | "project" | "team";
  read: boolean;
  createdAt: Date;
}

export enum NotificationType {
  TaskAssigned = "task-assigned",
  TaskUpdated = "task-updated",
  TaskCommented = "task-commented",
  ProjectInvite = "project-invite",
  TeamInvite = "team-invite",
  Mention = "mention",
  DueDateReminder = "due-date-reminder",
}
