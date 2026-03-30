import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from './roles.decorator.js';
import { ErrorCode } from '../common/constants/error-constants.js';
import type { AuthUser } from '../auth/strategies/jwt.strategy.js';

/**
 * Role guard — checks that the authenticated user holds at least one
 * of the required role names (from the JWT payload).
 *
 * Role names are matched against req.user.roles (string[]) embedded in the token.
 * Apply after JwtAuthGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as Record<string, unknown>)[
      'user'
    ] as AuthUser;

    const hasRole = requiredRoles.some((role) => user.roles.includes(role));
    if (!hasRole) throw new ForbiddenException(ErrorCode.FORBIDDEN);

    return true;
  }
}
