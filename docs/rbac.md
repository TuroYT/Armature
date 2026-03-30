# RBAC — Role-Based Access Control

## Overview

Access control is **fully stored in the database**. Adding a new role or permission requires only a DB insert — no code change, no redeploy.

## Data model

```
User ──n:n── Role ──n:n── Permission
 │                             ▲
 └───────────────────────n:n───┘  (UserPermission — direct overrides)
```

| Model            | Description                                                     |
| ---------------- | --------------------------------------------------------------- |
| `Role`           | Named role — e.g. `admin`, `moderator`, `user`                  |
| `Permission`     | Named capability — e.g. `resources:read`, `users:delete`        |
| `UserRole`       | Assigns a role to a user (join table)                           |
| `RolePermission` | Assigns a permission to a role (join table)                     |
| `UserPermission` | Direct permission override on a user — bypasses role assignment |

## Permission resolution

A user's effective permissions are the **union** of:

1. All permissions granted via their roles (`RolePermission`)
2. All permissions directly assigned to them (`UserPermission`)

Users with the **`admin` role bypass all permission checks**.

## Default roles (seed)

| Role        | Permissions                                                                  |
| ----------- | ---------------------------------------------------------------------------- |
| `user`      | `resources:read`                                                             |
| `moderator` | `resources:read`, `resources:update`                                         |
| `admin`     | `resources:create`, `resources:read`, `resources:update`, `resources:delete` |

## Guards

### @RequirePermissions()

Fine-grained check. The user must hold **all** listed permissions.

```ts
import { RequirePermissions } from '../guards/permissions.guard.js';

@RequirePermissions('resources:update')
@Patch(':id')
update(@Param() params: IdParamsDto, @Body() dto: UpdateResourceDto) { ... }

// Multiple permissions — user must have ALL of them
@RequirePermissions('resources:create', 'resources:read')
@Post()
create(@Body() dto: CreateResourceDto) { ... }
```

### @Roles()

Coarse role check. The user must hold **at least one** of the listed roles.

```ts
import { Roles } from '../guards/roles.decorator.js';
import { RolesGuard } from '../guards/roles.guard.js';

@UseGuards(RolesGuard)
@Roles('admin', 'moderator')
@Get('admin-area')
adminArea() { ... }
```

### OwnershipGuard

Ensures the authenticated user owns the resource before allowing modification. Extend `OwnershipGuard` and implement `getOwnerId()` to adapt it to any resource.

## Guard order

Always apply `AuthGuard` (JWT) first, then business guards:

```ts
@UseGuards(AuthGuard('jwt'), PermissionsGuard)
@Controller('api/resources')
export class ResourceController { ... }
```

`AuthGuard` populates `request.user`; subsequent guards depend on it being present.

## Redis caching

When `REDIS_URL` is set, resolved permission sets are cached per user with a **5-minute TTL**:

- Cache key: `permissions:{userId}`
- Cache hit → no DB query, instant resolution
- Cache miss → DB query, result stored in cache

**Invalidation:** call `CacheService.del('permissions:{userId}')` whenever a user's roles or direct permissions change.

```ts
// Example: after updating a user's roles
await this.cache.del(`permissions:${userId}`);
```

When Redis is unavailable, the guard falls back silently to the database on every request.

## Adding a new permission

1. Insert a row in the `permissions` table: `{ name: 'invoices:send', description: '...' }`
2. Assign it to a role via `role_permissions`, or directly to a user via `user_permissions`
3. Use `@RequirePermissions('invoices:send')` on the route

No code change or migration required.

## Adding a new role

1. Insert a row in the `roles` table: `{ name: 'billing', label: 'Billing Manager' }`
2. Assign permissions via `role_permissions`
3. Assign users via `user_roles`
