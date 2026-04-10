import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';
import type { AuthUser } from '../../auth/strategies/jwt.strategy.js';

/**
 * Extracts the authenticated user from a WebSocket execution context.
 * WebSocket equivalent of `@CurrentUser()`.
 *
 * The user is populated by the Socket.IO auth middleware registered in
 * `WebsocketGateway.afterInit()` — it is guaranteed to be set by the time
 * any `@SubscribeMessage` handler runs, since unauthenticated handshakes are
 * rejected before the socket reaches the connected state.
 *
 * ```ts
 * @UseGuards(WsJwtGuard)
 * @SubscribeMessage('my-event')
 * handle(@WsCurrentUser() user: AuthUser) { ... }
 * ```
 */
export const WsCurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const client = ctx.switchToWs().getClient<Socket>();
    return (client.data as { user: AuthUser }).user;
  },
);
