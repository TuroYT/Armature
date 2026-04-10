import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ErrorCode } from '../../common/constants/error-constants.js';

/**
 * Per-event WebSocket guard.
 *
 * Verifies that `client.data.user` was populated by the Socket.IO auth
 * middleware registered in `WebsocketGateway.afterInit()`. Because that
 * middleware rejects the handshake for unauthenticated clients, this guard
 * is a safety net for handlers that need an explicit auth assertion.
 *
 * ```ts
 * @UseGuards(WsJwtGuard)
 * @SubscribeMessage('my-event')
 * handleEvent(@WsCurrentUser() user: AuthUser) { ... }
 * ```
 *
 * Note: token verification itself happens once at connection time in
 * `WebsocketGateway.afterInit()` via `server.use()`. Sockets that fail
 * auth never reach the connected state and cannot emit or receive events.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();
    if (!(client.data as { user?: unknown }).user) {
      throw new WsException(ErrorCode.UNAUTHORIZED);
    }
    return true;
  }
}
