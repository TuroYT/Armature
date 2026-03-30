import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../strategies/jwt.strategy.js';

/**
 * Extracts the authenticated user from the request.
 * Only available on routes protected by JwtAuthGuard.
 *
 * @example
 * ```ts
 * @Get('me')
 * getProfile(@CurrentUser() user: AuthUser) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request as unknown as Record<string, unknown>)['user'] as AuthUser;
  },
);
