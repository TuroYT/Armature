import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErrorCode } from '../constants/error-constants.js';
import { I18nService } from '../services/i18n.service.js';
import { LoggerService } from '../logger/logger.service.js';

/**
 * Global exception filter.
 *
 * - Catches all exceptions (HTTP and unknown).
 * - Translates ErrorCode strings via Accept-Language header.
 * - Logs unhandled exceptions (non-HTTP) as errors.
 * - Returns a consistent JSON error shape.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger: LoggerService;

  constructor(
    logger: LoggerService,
    private readonly i18n: I18nService,
  ) {
    this.logger = logger.withContext('ExceptionFilter');
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (!(exception instanceof HttpException)) {
      this.logger.error('Unhandled exception', {
        error:
          exception instanceof Error ? exception.message : String(exception),
        stack: exception instanceof Error ? exception.stack : undefined,
        path: request.url,
      });
    }

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    const rawMessage =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as Record<string, unknown> | null)?.message ??
          ErrorCode.INTERNAL_SERVER_ERROR);

    const error =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : ((exceptionResponse as Record<string, unknown> | null)?.error ??
          ErrorCode.INTERNAL_SERVER_ERROR);

    const locale = this.i18n.resolveLocale(request.headers['accept-language']);

    const message = Array.isArray(rawMessage)
      ? rawMessage.map((m: string) =>
          this.i18n.translate(m as ErrorCode, locale),
        )
      : this.i18n.translate(rawMessage as ErrorCode, locale);

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
