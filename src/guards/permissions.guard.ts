import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { CacheService } from '../cache/cache.service.js';
import { ErrorCode } from '../common/constants/error-constants.js';
import type { AuthUser } from '../auth/strategies/jwt.strategy.js';

export const PERMISSIONS_KEY = 'permissions';

/** Cache TTL for resolved permission sets (seconds). */
const PERMISSIONS_CACHE_TTL = 300; // 5 minutes

/**
 * Declare required permissions on a route.
 * The user must hold ALL listed permissions (via roles or direct assignment).
 *
 * @example
 * ```ts
 * @RequirePermissions('users:delete')
 * @Delete(':id')
 * remove() { ... }
 * ```
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Fine-grained permission guard.
 *
 * Resolves effective permissions as the union of:
 *   - Permissions granted via the user's roles (RolePermission)
 *   - Direct permissions assigned to the user (UserPermission)
 *
 * Resolution is cached in Redis when available (TTL: 5 min).
 * Cache is keyed per user: `permissions:{userId}`.
 *
 * Cache invalidation: call CacheService.del(`permissions:{userId}`) whenever
 * a user's roles or direct permissions change.
 *
 * Users with the "admin" role bypass all permission checks.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as unknown as Record<string, unknown>)[
      'user'
    ] as AuthUser;

    if (user.roles.includes('admin')) return true;

    const granted = await this.resolvePermissions(user);
    const hasAll = required.every((p) => granted.has(p));

    if (!hasAll) {
      throw new ForbiddenException(ErrorCode.INSUFFICIENT_PERMISSIONS);
    }

    return true;
  }

  /**
   * Resolves the full set of effective permissions for a user.
   * Uses Redis cache when available, falls back to DB otherwise.
   */
  private async resolvePermissions(user: AuthUser): Promise<Set<string>> {
    const cacheKey = `permissions:${user.id}`;

    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return new Set(JSON.parse(cached) as string[]);
    }

    const [rolePerms, userPerms] = await Promise.all([
      this.prisma.rolePermission.findMany({
        where: { role: { name: { in: user.roles } } },
        include: { permission: true },
      }),
      this.prisma.userPermission.findMany({
        where: { userId: user.id },
        include: { permission: true },
      }),
    ]);

    const permissionNames = [
      ...rolePerms.map((rp) => rp.permission.name),
      ...userPerms.map((up) => up.permission.name),
    ];

    await this.cache.set(
      cacheKey,
      JSON.stringify(permissionNames),
      PERMISSIONS_CACHE_TTL,
    );

    return new Set(permissionNames);
  }
}
