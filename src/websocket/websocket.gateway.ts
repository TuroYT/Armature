import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
  type WsResponse,
} from '@nestjs/websockets';
import { UseFilters, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { WsExceptionFilter } from './filters/ws-exception.filter.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import { WsCurrentUser } from './decorators/ws-current-user.decorator.js';
import { ErrorCode } from '../common/constants/error-constants.js';
import type { AuthUser, JwtPayload } from '../auth/strategies/jwt.strategy.js';

/**
 * Central WebSocket gateway.
 *
 * ## Authentication
 * Every connection must supply a valid JWT access token. Pass it in the
 * Socket.IO handshake `auth` object (recommended) or as a Bearer token in the
 * `Authorization` header:
 *
 * ```ts
 * // Client-side
 * const socket = io('http://localhost:3000', {
 *   auth: { token: '<access-token>' },
 * });
 * ```
 *
 * Invalid / missing tokens are rejected immediately and the socket is
 * disconnected.
 *
 * ## Server → Client events
 * The gateway exposes an `emit()` helper so any service can broadcast domain
 * events without depending on Socket.IO internals:
 *
 * ```ts
 * // In any service that injects WebsocketGateway:
 * this.ws.emit('resource:created', payload);
 * ```
 *
 * ## Client → Server events
 * Clients can send events after connecting. Built-in handlers:
 *
 * | Event       | Payload     | Response event | Description               |
 * |-------------|-------------|----------------|---------------------------|
 * | `ping`      | —           | `pong`         | Liveness check            |
 * | `subscribe` | `{ room }`  | —              | Join a named room         |
 * | `unsubscribe` | `{ room }` | —             | Leave a named room        |
 *
 * Add your own handlers with `@SubscribeMessage('event-name')`.
 *
 * ## Rooms
 * Clients may join rooms to receive scoped broadcasts. Use
 * `emitToRoom(room, event, data)` from any service to target a room instead of
 * broadcasting to everyone.
 */
@WebSocketGateway({
  cors: {
    origin: process.env['CORS_ORIGIN'] ?? '*',
    credentials: true,
  },
})
@UseFilters(WsExceptionFilter)
export class WebsocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  constructor(private readonly jwtService: JwtService) {}

  // ── Connection lifecycle ────────────────────────────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    const token =
      (client.handshake.auth as Record<string, string> | undefined)?.token ??
      client.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      client.disconnect();
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      client.data.user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
      } satisfies AuthUser;
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket): void {
    // Override to add teardown logic (e.g. presence tracking).
  }

  // ── Server → Client helpers ─────────────────────────────────────────────────

  /**
   * Broadcast an event to **all** connected, authenticated clients.
   *
   * ```ts
   * this.ws.emit('resource:created', dto);
   * ```
   */
  emit<T>(event: string, data: T): void {
    this.server.emit(event, data);
  }

  /**
   * Broadcast an event to every client in a specific room.
   *
   * ```ts
   * this.ws.emitToRoom('resources', 'resource:updated', dto);
   * ```
   */
  emitToRoom<T>(room: string, event: string, data: T): void {
    this.server.to(room).emit(event, data);
  }

  // ── Client → Server handlers ────────────────────────────────────────────────

  /** Liveness check — client sends `ping`, server replies with `pong`. */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ping')
  handlePing(
    @WsCurrentUser() user: AuthUser,
  ): WsResponse<{ userId: string; timestamp: string }> {
    return {
      event: 'pong',
      data: { userId: user.id, timestamp: new Date().toISOString() },
    };
  }

  /**
   * Join a named room to receive scoped broadcasts.
   *
   * ```ts
   * socket.emit('subscribe', { room: 'resources' });
   * ```
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!body?.room) throw new WsException(ErrorCode.BAD_REQUEST);
    void client.join(body.room);
  }

  /**
   * Leave a named room.
   *
   * ```ts
   * socket.emit('unsubscribe', { room: 'resources' });
   * ```
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: Socket,
  ): void {
    if (!body?.room) throw new WsException(ErrorCode.BAD_REQUEST);
    void client.leave(body.room);
  }
}
