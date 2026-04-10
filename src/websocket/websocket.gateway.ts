import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
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
import { WsPolicyRegistry } from './policies/ws-policy.registry.js';
import { ErrorCode } from '../common/constants/error-constants.js';
import type { AuthUser, JwtPayload } from '../auth/strategies/jwt.strategy.js';

/**
 * Central WebSocket gateway.
 *
 * ## Authentication
 * Every connection must supply a valid JWT access token in the Socket.IO
 * handshake `auth` object (recommended) or as a `Bearer` header:
 *
 * ```ts
 * const socket = io('http://localhost:3000', {
 *   auth: { token: '<access-token>' },
 * });
 * ```
 *
 * Authentication runs in a Socket.IO middleware (`server.use()`), which means
 * the handshake is rejected **before** the connection is established. This
 * guarantees that `client.data.user` is always set when any event handler runs,
 * and that unauthenticated sockets cannot receive unguarded broadcasts.
 *
 * ## Server → Client events
 * Use the `emit()` / `emitToRoom()` helpers from any injected service.
 * If a policy is registered for the event (via `WsPolicyRegistry`), the
 * payload is evaluated per-client — only clients that pass the policy receive
 * the event.
 *
 * ```ts
 * this.ws.emit('resource:created', dto);          // respects policies
 * this.ws.emitToRoom('admin', 'stats:updated', dto); // respects policies
 * ```
 *
 * ## Client → Server events
 *
 * | Event         | Payload       | Response       | Description             |
 * |---------------|---------------|----------------|-------------------------|
 * | `ping`        | —             | `pong`         | Liveness check          |
 * | `subscribe`   | `{ room }`    | —              | Join a room             |
 * | `unsubscribe` | `{ room }`    | —              | Leave a room            |
 *
 * Add custom handlers with `@SubscribeMessage('event-name')`.
 *
 * ## Policies
 * Register rules via `WsPolicyRegistry` in any `OnModuleInit` provider:
 *
 * ```ts
 * // Event policy — filter who receives the payload
 * registry.register<ResourceDto>('resource:created', (user, res) =>
 *   user.roles.includes('admin') || res.ownerId === user.id,
 * );
 *
 * // Room policy — control who can subscribe
 * registry.registerRoomPolicy('admin', (user) =>
 *   user.roles.includes('admin'),
 * );
 * ```
 */
// CORS is configured via WsAdapter in main.ts, which reads from ConfigService.
@WebSocketGateway()
@UseFilters(WsExceptionFilter)
export class WebsocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly policyRegistry: WsPolicyRegistry,
  ) {}

  // ── Initialisation ──────────────────────────────────────────────────────────

  /**
   * Register a Socket.IO middleware that authenticates every connection at
   * the handshake stage — **before** `handleConnection` fires and before the
   * socket can receive any broadcast.
   *
   * Rejecting here (via `next(new Error(...))`) causes Socket.IO to refuse the
   * upgrade entirely, so unauthenticated sockets never enter the connected
   * state and cannot receive events without a policy.
   */
  afterInit(server: Server): void {
    server.use((socket, next) => {
      void this.authenticateSocket(socket, next);
    });
  }

  private async authenticateSocket(
    socket: Socket,
    next: (err?: Error) => void,
  ): Promise<void> {
    const token =
      (socket.handshake.auth as Record<string, string> | undefined)?.token ??
      socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      next(new Error(ErrorCode.UNAUTHORIZED));
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (!payload.sub) {
        next(new Error(ErrorCode.UNAUTHORIZED));
        return;
      }
      (socket.data as { user: AuthUser }).user = {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles,
      };
      next();
    } catch {
      next(new Error(ErrorCode.INVALID_TOKEN));
    }
  }

  // ── Connection lifecycle ────────────────────────────────────────────────────

  handleConnection(): void {
    // User is already authenticated by the middleware in afterInit().
    // Override to add post-connect logic (e.g. presence tracking, room auto-join).
  }

  handleDisconnect(): void {
    // Override to add teardown logic (e.g. presence tracking).
  }

  // ── Server → Client helpers ─────────────────────────────────────────────────

  /**
   * Broadcast an event to all connected clients.
   *
   * If a policy is registered for `event` (via `WsPolicyRegistry`), the
   * payload is evaluated per-client and only delivered to those that pass.
   * With no policy the event is broadcast to everyone.
   *
   * ```ts
   * this.ws.emit('resource:created', dto);
   * ```
   */
  async emit<T>(event: string, data: T): Promise<void> {
    const policy = this.policyRegistry.getEventPolicy(event);
    if (!policy) {
      this.server.emit(event, data);
      return;
    }

    const sockets = await this.server.fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const user = (socket.data as { user?: AuthUser }).user;
        if (user && (await policy(user, data))) {
          socket.emit(event, data);
        }
      }),
    );
  }

  /**
   * Broadcast an event to every client in a room.
   *
   * Policies apply the same way as `emit()`.
   *
   * ```ts
   * this.ws.emitToRoom('admin', 'stats:updated', dto);
   * ```
   */
  async emitToRoom<T>(room: string, event: string, data: T): Promise<void> {
    const policy = this.policyRegistry.getEventPolicy(event);
    if (!policy) {
      this.server.to(room).emit(event, data);
      return;
    }

    const sockets = await this.server.in(room).fetchSockets();
    await Promise.all(
      sockets.map(async (socket) => {
        const user = (socket.data as { user?: AuthUser }).user;
        if (user && (await policy(user, data))) {
          socket.emit(event, data);
        }
      }),
    );
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
   * Join a named room to receive room-scoped broadcasts.
   * If a room policy is registered, it is enforced before the client joins.
   *
   * ```ts
   * socket.emit('subscribe', { room: 'admin' });
   * ```
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: Socket,
    @WsCurrentUser() user: AuthUser,
  ): Promise<void> {
    if (!body?.room) throw new WsException(ErrorCode.BAD_REQUEST);

    const roomPolicy = this.policyRegistry.getRoomPolicy(body.room);
    if (roomPolicy && !(await roomPolicy(user))) {
      throw new WsException(ErrorCode.FORBIDDEN);
    }

    await client.join(body.room);
  }

  /**
   * Leave a named room.
   *
   * ```ts
   * socket.emit('unsubscribe', { room: 'admin' });
   * ```
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() body: { room: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    if (!body?.room) throw new WsException(ErrorCode.BAD_REQUEST);
    await client.leave(body.room);
  }
}
