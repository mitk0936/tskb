import { Notification } from "../../../shared/types";

export interface NotificationListProps {
  notifications: Notification[];
  onMarkAsRead: (id: string) => void;
}

export function NotificationList({ notifications, onMarkAsRead }: NotificationListProps) {
  return <div>Notifications</div>;
}
