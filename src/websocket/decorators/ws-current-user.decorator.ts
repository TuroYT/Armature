import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';
import type { AuthUser } from '../../auth/strategies/jwt.strategy.js';

/**
 * Extracts the authenticated user from a WebSocket execution context.
 * WebSocket equivalent of `@CurrentUser()`.
 *
 * Only available on handlers protected by `WsJwtGuard` (or after a successful
 * `handleConnection` which populates `client.data.user`).
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
