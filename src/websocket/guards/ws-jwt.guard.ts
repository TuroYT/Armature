import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ErrorCode } from '../../common/constants/error-constants.js';

/**
 * Per-event WebSocket guard.
 *
 * Verifies that `client.data.user` was populated during `handleConnection`.
 * Use this on individual `@SubscribeMessage` handlers that require
 * an authenticated caller:
 *
 * ```ts
 * @UseGuards(WsJwtGuard)
 * @SubscribeMessage('my-event')
 * handleEvent(@WsCurrentUser() user: AuthUser) { ... }
 * ```
 *
 * Note: authentication itself (token verification) happens once in
 * `WebsocketGateway.handleConnection`. Sockets that fail auth are
 * disconnected before they can send any messages.
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
