import { NotificationService } from "../services/notification.service";

export class NotificationController {
  constructor(private notificationService: NotificationService) {}

  async getUserNotifications(userId: string, unreadOnly?: boolean) {}

  async markAsRead(id: string) {}

  async markAllAsRead(userId: string) {}

  async deleteNotification(id: string) {}
}
