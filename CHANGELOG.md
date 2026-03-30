# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-30

### Added

- JWT authentication with access + refresh token rotation (bcrypt-hashed in DB)
- DB-backed RBAC — `Role`, `Permission`, `UserRole`, `RolePermission`, `UserPermission` models
- `PermissionsGuard` with Redis-cached permission resolution (5 min TTL)
- `RolesGuard` for coarse role-level access control
- `OwnershipGuard` for resource ownership enforcement
- `LoggerService` with port/adapter pattern — coloured text in dev, JSON in prod
- Typed `ErrorCode` constants with `Accept-Language`-aware i18n (en + fr)
- `serialize()` utility — strips non-`@Expose()` fields from responses
- Generic pagination with `createPaginatedDto()` factory
- Optional `GoogleAuthModule` — self-activates when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set
- Optional `QueueModule` (BullMQ) — self-activates when `REDIS_URL` is set
- Optional `PaymentModule` (Stripe) — self-activates when `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` are set
- `CacheService` — global Redis no-op wrapper, transparent when unconfigured
- `GET /api/auth/methods` — lists available authentication methods dynamically
- `SocialProvider` abstract class + `SOCIAL_PROVIDER` multi-token for extensible OAuth
- Zod-based environment validation — crashes at startup on misconfiguration
- Prisma 7 with `@prisma/adapter-pg`, DB-url in `prisma.config.ts`
- Swagger UI with conditional route documentation per active module
- Prisma seed — default roles (`user`, `moderator`, `admin`), permissions, admin user
- Example `Resource` CRUD module as a cloneable template
- MkDocs + Material documentation in `/docs`
- GitHub Actions CI (lint, test, build) and docs deployment to GitHub Pages
- Husky + lint-staged pre-commit hooks
