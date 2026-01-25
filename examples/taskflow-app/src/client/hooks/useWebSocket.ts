import { useEffect } from "react";
import { WebSocketService } from "../services/websocket.service";

export function useWebSocket() {
  const ws = new WebSocketService();

  useEffect(() => {
    return () => {};
  }, []);

  return ws;
}
