import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { correlationStorage } from './correlation.context.js';

const HEADER = 'x-correlation-id';

/**
 * Assigns a correlation ID to every incoming HTTP request and binds it to an
 * AsyncLocalStorage scope for the request lifetime. Honours an inbound
 * `X-Correlation-Id` header (forwarded by upstream proxies) when present.
 *
 * The ID is also echoed back on the response so clients can correlate logs.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers[HEADER];
    const correlationId =
      typeof inbound === 'string' && inbound.length > 0
        ? inbound
        : randomUUID();

    res.setHeader(HEADER, correlationId);
    correlationStorage.run({ correlationId }, () => next());
  }
}
