export interface WebSocketClient {
  connect(): void;
  disconnect(): void;
  on(event: string, callback: (data: any) => void): void;
  emit(event: string, data: any): void;
}

export class WebSocketService implements WebSocketClient {
  private ws: WebSocket | null = null;

  connect() {}

  disconnect() {}

  on(event: string, callback: (data: any) => void) {}

  emit(event: string, data: any) {}
}
