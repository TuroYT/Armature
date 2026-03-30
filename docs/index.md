# Armature

**Opinionated NestJS boilerplate** — ready to fork, ready to ship.

Armature gives you a solid, consistent foundation so you can focus on your business logic from day one, not on wiring up auth, logging, and error handling.

## What's included

| Module               | Description                                                                       |
| -------------------- | --------------------------------------------------------------------------------- |
| **JWT Auth**         | Access + refresh token rotation, bcrypt-hashed tokens in DB                       |
| **RBAC**             | DB-backed roles and permissions, `n:n` user↔role, Redis-cached resolution         |
| **Logger**           | Structured logging with port/adapter pattern — coloured text in dev, JSON in prod |
| **Typed errors**     | `ErrorCode` constants, auto-translated via `Accept-Language` header               |
| **Pagination**       | Generic `createPaginatedDto()` factory with Swagger support                       |
| **Serialization**    | `serialize()` utility — only `@Expose()` fields reach the client                  |
| **Health check**     | `GET /api/health` — DB ping, optional Redis status                                |
| **Example resource** | Full CRUD module to clone as a starting point                                     |

## Optional modules (self-activating)

These modules activate automatically when their environment variables are set. No code changes required.

| Module             | Env vars required                             | What it adds                               |
| ------------------ | --------------------------------------------- | ------------------------------------------ |
| **Google OAuth**   | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`   | Social login, Swagger-documented routes    |
| **Redis / BullMQ** | `REDIS_URL`                                   | Background job queues + permission caching |
| **Stripe**         | `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` | Payment intents, webhook handling          |

## Quick start

```bash
git clone git@github.com:TuroYT/Armature.git my-app
cd my-app
npm install
cp .env.example .env   # fill in DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npx prisma migrate dev
npm run start:dev
```

Swagger UI → [http://localhost:3000/api/docs](http://localhost:3000/api/docs)

## Tech stack

- **NestJS 11** — TypeScript strict, `nodenext` module resolution
- **Prisma 7** — PostgreSQL, `@prisma/adapter-pg`
- **Passport** — JWT + Google OAuth2 strategies
- **Zod** — Environment validation (crashes at startup on misconfiguration)
- **ioredis** — Optional Redis cache (no-op when unconfigured)
- **BullMQ** — Optional background queues
- **Stripe** — Optional payment processing
- **Swagger / OpenAPI** — Auto-generated, always up to date
