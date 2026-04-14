# Armature — Claude Code guidance

Opinionated NestJS 11 boilerplate (TypeScript, Prisma, PostgreSQL, Socket.IO).

---

## Commands

```bash
npm run start:dev   # Dev server with hot-reload
npm run build       # TypeScript compilation (nest build)
npm run test        # Unit tests (jest)
npm run test:e2e    # End-to-end tests
npm run lint        # ESLint
```

---

## Key conventions

### Errors — always use `ErrorCode`

Never throw raw strings. Use the typed constants in
`src/common/constants/error-constants.ts`:

```ts
throw new NotFoundException(ErrorCode.RESOURCE_NOT_FOUND);
throw new UnauthorizedException(ErrorCode.UNAUTHORIZED);
```

When adding a new code, also add its translation in **both**
`src/common/constants/translations/en.ts` and `fr.ts`. The
`Record<ErrorCode, string>` type enforces this at compile time.

### Serialization — `serialize()` + `@Expose()`

Never return raw Prisma objects. Use `serialize(DtoClass, data)` from
`src/common/utils/serialize.ts`. Only fields decorated with `@Expose()` are
included in the response.

### Guards

| Guard | Decorator | Purpose |
|-------|-----------|---------|
| `JwtAuthGuard` | _(global)_ | JWT on all routes |
| `@Public()` | `src/auth/decorators/public.decorator.ts` | Opt out of JWT guard |
| `RolesGuard` | `@Roles('admin')` | Coarse role check |
| `PermissionsGuard` | `@RequirePermissions('read:resource')` | Fine-grained permissions |
| `OwnershipGuard` | `@UseGuards(OwnershipGuard)` | Resource ownership |

### Optional modules (self-activating)

These modules activate automatically based on env vars — no code change needed:

| Module | Env var required |
|--------|-----------------|
| `QueueModule` | `REDIS_URL` |
| `GoogleAuthModule` | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| `PaymentModule` | `STRIPE_SECRET_KEY` |

Pattern: `static register(): DynamicModule` checks `process.env` and returns
an empty module if the dependency is missing.

### Adding a new feature module

1. `nest g module my-feature` — scaffold
2. Create `MyFeatureService` with `PrismaService` + `LoggerService`
3. Create `MyFeatureController` with `@ApiBearerAuth()` + `@ApiTags()`
4. Add to `app.module.ts` imports

---

## WebSocket layer

### Architecture

```
src/websocket/
├── ws.adapter.ts                  Custom IoAdapter — reads CORS from ConfigService
├── websocket.module.ts            Provides & exports Gateway, Registry, Guard, Filter
├── websocket.gateway.ts           Socket.IO gateway — JWT auth, policy-aware emit
├── policies/
│   └── ws-policy.registry.ts      Register event & room access rules
├── guards/
│   └── ws-jwt.guard.ts            Per-event guard (checks client.data.user)
├── filters/
│   └── ws-exception.filter.ts     Catches WsException → emits `error` with i18n message
└── decorators/
    └── ws-current-user.decorator.ts  @WsCurrentUser() — equiv. of @CurrentUser()
```

### Adding real-time events to a module

1. Import `WebsocketModule` in the feature module
2. Inject `WebsocketGateway` in the service, call `void this.ws.emit(event, data).catch(...)`
3. Create `MyWsPolicy implements OnModuleInit` to register access rules via `WsPolicyRegistry`
4. Add `MyWsPolicy` to the feature module's `providers`

### Policy system (row-level security)

```ts
// No policy → broadcast to all authenticated clients
// Policy → evaluated per-socket before delivery

registry.register<MyDto>('my-model:created', (user, data) =>
  user.roles.includes('admin') || data.ownerId === user.id,
);

registry.registerRoomPolicy('my-room', (user) =>
  user.roles.includes('admin'),
);
```

See `src/resource/resource.ws-policy.ts` for the full example.

### WS auth flow

- Token passed in `handshake.auth.token` (preferred) or `Authorization: Bearer` header
- Global `JwtAuthGuard` is HTTP-only — WS auth happens in a `server.use()` middleware registered in `afterInit()`
- Invalid/missing token → handshake rejected before connection is established (client receives `connect_error`)

---

## Skill Claude Code

Le projet dispose d'un skill Claude Code dédié (`/armature`) qui encode toutes
les conventions ci-dessus sous forme de guide actionnable.

### Utilisation

Tape `/armature` dans n'importe quelle conversation pour charger le guide
complet : codes d'erreur, sérialisation, guards, WebSocket, modules optionnels,
checklist finale.

### Contenu du skill

| Section | Ce qu'elle couvre |
|---------|-------------------|
| Codes d'erreur | `ErrorCode`, mise à jour des deux fichiers de traduction |
| Sérialisation | `serialize()` + `@Expose()`, DTOs paginés |
| Guards & décorateurs | Tableau de référence complet |
| Conventions controller | `@ApiTags`, `@ApiBearerAuth`, params, pagination |
| Conventions service | Injection, fire-and-forget WS, logger structuré |
| Nouveau module | Séquence scaffold → service → controller → app.module |
| WebSocket | Émission, politiques d'accès par event et par room |
| Modules optionnels | Pattern `DynamicModule` avec check env var |
| Variables d'env | Zod schema, `.env.example` |
| Erreurs courantes | Tableau mauvaises vs bonnes pratiques |
| Checklist finale | À valider avant chaque commit |

---

## MCP Armature

Un serveur MCP (Model Context Protocol) est disponible dans `mcp/`. Il expose
les endpoints du backend comme outils utilisables directement par Claude.

### Setup

```bash
cd mcp && npm install
```

Le MCP se connecte au backend via `ARMATURE_BASE_URL` (défaut: `http://localhost:3000`).
Un token JWT peut être pré-chargé via `ARMATURE_TOKEN`.

### Outils disponibles

| Outil | Endpoint |
|-------|----------|
| `auth_methods` | GET /api/auth/methods |
| `auth_register` | POST /api/auth/register |
| `auth_login` | POST /api/auth/login |
| `auth_logout` | POST /api/auth/logout |
| `auth_me` | GET /api/auth/me |
| `resource_list` | GET /api/resources |
| `resource_get` | GET /api/resources/:id |
| `resource_create` | POST /api/resources |
| `resource_update` | PATCH /api/resources/:id |
| `resource_delete` | DELETE /api/resources/:id |
| `health_check` | GET /health |

Le MCP est enregistré dans `.claude/settings.json`. Il démarre automatiquement
avec Claude Code.

---

## Environment variables

See `.env.example` and `src/config/env.validation.ts` (Zod schema) for the
full list. The app crashes at startup if required variables are missing.

Required: `DATABASE_URL`, `JWT_SECRET` (≥ 32 chars), `JWT_REFRESH_SECRET`
Optional: `REDIS_URL`, `STRIPE_SECRET_KEY`, `GOOGLE_CLIENT_ID/SECRET`, `CORS_ORIGIN`
