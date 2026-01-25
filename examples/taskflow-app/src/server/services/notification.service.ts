import { Notification, NotificationType } from "../../shared/types";

export class NotificationService {
  async getByUser(userId: string, unreadOnly?: boolean): Promise<Notification[]> {
    return [];
  }

  async create(notificationData: Omit<Notification, "id" | "createdAt">): Promise<Notification> {
    throw new Error("Not implemented");
  }

  async markAsRead(id: string): Promise<Notification | null> {
    return null;
  }

  async markAllAsRead(userId: string): Promise<number> {
    return 0;
  }

  async delete(id: string): Promise<boolean> {
    return false;
  }

  async sendTaskAssignedNotification(taskId: string, assigneeId: string): Promise<void> {}

  async sendMentionNotification(
    userId: string,
    mentionedByUserId: string,
    contextId: string
  ): Promise<void> {}
}
