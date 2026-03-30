import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to users who have at least one of the specified role names.
 * Role names match the `Role.name` column in DB (e.g. "admin", "moderator").
 *
 * @example
 * ```ts
 * @Roles('admin')
 * @Delete(':id')
 * remove() { ... }
 *
 * @Roles('admin', 'moderator')
 * @Get()
 * findAll() { ... }
 * ```
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
