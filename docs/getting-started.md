# Getting Started

## Prerequisites

- Node.js ≥ 22
- PostgreSQL (local or remote)
- Redis _(optional — enables queues and permission caching)_

## Installation

```bash
git clone git@github.com:TuroYT/Armature.git my-app
cd my-app
npm install
```

## Environment variables

```bash
cp .env.example .env
```

### Required

| Variable             | Description                                                                    |
| -------------------- | ------------------------------------------------------------------------------ |
| `DATABASE_URL`       | PostgreSQL connection string — `postgresql://user:pass@host:5432/dbname`       |
| `JWT_SECRET`         | Secret for access tokens — minimum 32 characters                               |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens — minimum 32 characters, different from `JWT_SECRET` |

### Optional — behaviour

| Variable                 | Default       | Description                             |
| ------------------------ | ------------- | --------------------------------------- |
| `NODE_ENV`               | `development` | `development` \| `production` \| `test` |
| `PORT`                   | `3000`        | HTTP port                               |
| `CORS_ORIGIN`            | _(none)_      | Allowed CORS origin(s)                  |
| `JWT_EXPIRES_IN`         | `15m`         | Access token lifetime                   |
| `JWT_REFRESH_EXPIRES_IN` | `7d`          | Refresh token lifetime                  |
| `LOG_LEVEL`              | `DEBUG`       | `DEBUG` \| `LOG` \| `WARN` \| `ERROR`   |

### Optional — Redis / BullMQ

| Variable    | Description                                        |
| ----------- | -------------------------------------------------- |
| `REDIS_URL` | Redis connection string — `redis://localhost:6379` |

### Optional — Stripe

| Variable                | Description                               |
| ----------------------- | ----------------------------------------- |
| `STRIPE_SECRET_KEY`     | Stripe secret key (`sk_…`)                |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret (`whsec_…`) |

### Optional — Google OAuth

| Variable               | Description                |
| ---------------------- | -------------------------- |
| `GOOGLE_CLIENT_ID`     | Google OAuth client ID     |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

!!! warning
    The app **crashes at startup** if a required variable is missing or malformed. Optional variables are safely ignored when absent.

## Database setup

```bash
# Apply migrations and regenerate the Prisma client
npx prisma migrate dev

# Seed default roles, permissions, and an admin user
npx prisma db seed
```

The seed creates:

- **Permissions** — `resources:create`, `resources:read`, `resources:update`, `resources:delete`
- **Roles** — `user` (read), `moderator` (read + update), `admin` (all)
- **Admin user** — `admin@example.com` / `Admin1234!`

## Running

=== "Development"

    Hot-reload via `ts-node`:

    ```bash
    npm run start:dev
    ```

=== "Production"

    Compile then run:

    ```bash
    npm run build
    node dist/main.js
    ```

=== "Docker"

    Starts PostgreSQL and the app together:

    ```bash
    docker compose up
    ```

## Useful commands

```bash
npm test              # Unit tests
npm run test:e2e      # End-to-end tests
npm run test:cov      # Coverage report
npm run lint          # ESLint with auto-fix
npm run format        # Prettier
npx prisma studio     # Visual DB browser
```

## API documentation

Swagger UI is available at `http://localhost:3000/api/docs` when the app is running. Optional module routes only appear in Swagger when their module is active.
