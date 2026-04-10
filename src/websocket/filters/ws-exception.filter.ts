import { ArgumentsHost, Catch, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ErrorCode } from '../../common/constants/error-constants.js';

/**
 * WebSocket exception filter.
 *
 * Catches both `WsException` (domain errors) and unexpected exceptions, then
 * emits an `error` event back to the offending client in a consistent shape:
 *
 * ```json
 * { "code": "UNAUTHORIZED", "message": "Authentication required" }
 * ```
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  override catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    if (exception instanceof WsException) {
      const error = exception.getError();
      client.emit('error', {
        code: typeof error === 'string' ? error : ErrorCode.BAD_REQUEST,
        message:
          typeof error === 'object' && error !== null && 'message' in error
            ? (error as { message: string }).message
            : String(error),
      });
      return;
    }

    this.logger.error('Unhandled WebSocket exception', {
      error:
        exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    client.emit('error', {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }
}
