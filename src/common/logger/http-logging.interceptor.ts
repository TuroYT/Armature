import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { LoggerService } from './logger.service.js';

/**
 * Logs every incoming HTTP request and its outcome.
 * Automatically registered globally — do not log requests manually in controllers.
 */
@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger.withContext('HTTP');
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, originalUrl } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = context.switchToHttp().getResponse<Response>();
          const duration = Date.now() - start;
          const user = (req as unknown as Record<string, unknown>)['user'] as
            | { id: string }
            | undefined;

          this.logger.log(
            `${method} ${originalUrl} → ${res.statusCode} (${duration}ms)`,
            {
              method,
              url: originalUrl,
              statusCode: res.statusCode,
              duration,
              ...(user?.id && { userId: user.id }),
            },
          );
        },
        error: (err: unknown) => {
          const duration = Date.now() - start;
          const status =
            err instanceof Object && 'getStatus' in err
              ? (err as { getStatus: () => number }).getStatus()
              : 500;

          this.logger.error(
            `${method} ${originalUrl} → ${status} (${duration}ms)`,
            {
              method,
              url: originalUrl,
              statusCode: status,
              duration,
              error: err instanceof Error ? err.message : String(err),
            },
          );
        },
      }),
    );
  }
}
