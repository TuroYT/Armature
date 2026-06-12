import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { correlationStorage } from './correlation.context.js';

const HEADER = 'x-correlation-id';

// Accept only UUID v4 from clients to prevent log injection via oversized or
// specially crafted header values. Anything else gets replaced with a fresh UUID.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Assigns a correlation ID to every incoming HTTP request and binds it to an
 * AsyncLocalStorage scope for the request lifetime. Honours an inbound
 * `X-Correlation-Id` header (forwarded by upstream proxies) when present and
 * well-formed (UUID v4 format); generates a fresh UUID otherwise.
 *
 * The ID is also echoed back on the response so clients can correlate logs.
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const inbound = req.headers[HEADER];
    const correlationId =
      typeof inbound === 'string' && UUID_RE.test(inbound)
        ? inbound
        : randomUUID();

    res.setHeader(HEADER, correlationId);
    correlationStorage.run({ correlationId }, () => next());
  }
}
