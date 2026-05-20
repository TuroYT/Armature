import { io, Socket } from 'socket.io-client';
import type { ResourceDto } from '../generated/schema.js';

type PongDto = { userId: string; timestamp: string };

type RealtimeEventMap = {
  'resource:created': ResourceDto;
  'resource:updated': ResourceDto;
  'resource:deleted': { id: string };
  pong: PongDto;
  connect: void;
  disconnect: string;
  connect_error: Error;
  error: { message: string };
};

type RealtimeEventHandler<K extends keyof RealtimeEventMap> = (
  data: RealtimeEventMap[K],
) => void;

export class RealtimeClient {
  private socket: Socket;

  constructor(baseUrl: string, token: string) {
    this.socket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
    });
  }

  on<K extends keyof RealtimeEventMap>(
    event: K,
    handler: RealtimeEventHandler<K>,
  ): this {
    this.socket.on(event as string, handler as (data: unknown) => void);
    return this;
  }

  off<K extends keyof RealtimeEventMap>(
    event: K,
    handler?: RealtimeEventHandler<K>,
  ): this {
    if (handler) {
      this.socket.off(event as string, handler as (data: unknown) => void);
    } else {
      this.socket.off(event as string);
    }
    return this;
  }

  subscribe(room: string): void {
    this.socket.emit('subscribe', { room });
  }

  unsubscribe(room: string): void {
    this.socket.emit('unsubscribe', { room });
  }

  ping(): void {
    this.socket.emit('ping');
  }

  isConnected(): boolean {
    return this.socket.connected;
  }

  disconnect(): void {
    this.socket.disconnect();
  }
}
