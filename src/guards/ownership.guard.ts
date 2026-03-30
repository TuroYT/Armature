import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ErrorCode } from '../common/constants/error-constants.js';
import type { AuthUser } from '../auth/strategies/jwt.strategy.js';

/**
 * Ownership guard — ensures the authenticated user owns the resource
 * identified by :id in the route params, or has the "admin" role.
 *
 * For domain-specific ownership (e.g. checking a DB relation), create a
 * dedicated guard in the relevant module instead of extending this one.
 */
@Injectable()
export class OwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as Record<string, unknown>)[
      'user'
    ] as AuthUser;
    const params = request.params as Record<string, string>;
    const resourceId = params['id'];

    if (!resourceId) throw new NotFoundException(ErrorCode.NOT_FOUND);
    if (user.roles.includes('admin')) return true;
    if (user.id !== resourceId)
      throw new ForbiddenException(ErrorCode.FORBIDDEN);

    return true;
  }
}
