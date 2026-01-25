import { useState, useEffect } from "react";
import { Notification } from "../../shared/types";

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  return { notifications, unreadCount, isLoading };
}
