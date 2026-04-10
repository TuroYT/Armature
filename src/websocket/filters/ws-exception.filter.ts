import { ArgumentsHost, Catch, Injectable } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { ErrorCode } from '../../common/constants/error-constants.js';
import { I18nService } from '../../common/services/i18n.service.js';
import { LoggerService } from '../../common/logger/logger.service.js';

/**
 * WebSocket exception filter.
 *
 * Catches both `WsException` (domain errors) and unexpected exceptions, then
 * emits an `error` event back to the offending client in a consistent shape:
 *
 * ```json
 * { "code": "UNAUTHORIZED", "message": "Authentication required" }
 * ```
 *
 * Error messages are translated via `I18nService` using the `Accept-Language`
 * header from the Socket.IO handshake — matching the HTTP exception filter
 * behaviour.
 */
@Injectable()
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger: LoggerService;

  constructor(
    private readonly i18n: I18nService,
    logger: LoggerService,
  ) {
    super();
    this.logger = logger.withContext('WsExceptionFilter');
  }

  override catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    // accept-language can be string | string[] in Node.js — normalise to string.
    const rawLang = client.handshake.headers['accept-language'] as
      | string
      | string[]
      | undefined;
    const acceptLanguage = Array.isArray(rawLang) ? rawLang[0] : rawLang;
    const locale = this.i18n.resolveLocale(acceptLanguage);

    if (exception instanceof WsException) {
      const error = exception.getError();
      const code = typeof error === 'string' ? error : ErrorCode.BAD_REQUEST;
      client.emit('error', {
        code,
        message: this.i18n.translate(code as ErrorCode, locale),
      });
      return;
    }

    this.logger.error('Unhandled WebSocket exception', {
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    client.emit('error', {
      code: ErrorCode.INTERNAL_SERVER_ERROR,
      message: this.i18n.translate(ErrorCode.INTERNAL_SERVER_ERROR, locale),
    });
  }
}
