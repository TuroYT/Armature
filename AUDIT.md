# Audit Armature — Correctifs & améliorations

Synthèse structurée d'un audit du boilerplate NestJS 11 (branch `claude/beautiful-ritchie-ylxf1h`).
Findings triés par sévérité, groupés par catégorie.

---

## 🔴 Critique — à corriger avant tout déploiement

### C1. Webhooks Stripe cassés — `rawBody` non activé
- **Fichier** : `src/main.ts:26` (croisé avec `src/payment/payment.controller.ts:55`)
- **Problème** : `NestFactory.create(AppModule, { bufferLogs: true })` n'active pas `rawBody: true`. Le contrôleur lit `req.rawBody!` qui sera `undefined`. La signature Stripe échouera systématiquement.
- **Fix** : `NestFactory.create(AppModule, { bufferLogs: true, rawBody: true })`.

---

## 🟠 Haute — bugs & failles à traiter rapidement

### H1. Health check retourne 200 même quand la DB est down
- **Fichier** : `src/health/health.controller.ts:32-44`
- **Problème** : Le catch renvoie `{ status: 'down' }` au lieu de `throw new HealthCheckError(...)`. Terminus ignore la valeur, `/health` reste vert alors que Postgres est injoignable — invisible pour probes Kubernetes / load balancers.
- **Fix** : `throw new HealthCheckError('database', { database: { status: 'down' } })` (idem Redis).

### H2. Race condition sur `POST /api/auth/register` → 500 au lieu de 409
- **Fichier** : `src/auth/auth.service.ts:49-73`
- **Problème** : Pattern `findUnique` puis `create` non atomique. Deux requêtes concurrentes hit la contrainte unique Prisma (P2002) → 500 générique au lieu de `USER_ALREADY_EXISTS`.
- **Fix** : try/catch autour du `.create()`, mapper `P2002` sur `ConflictException(ErrorCode.USER_ALREADY_EXISTS)`.

### H3. Refresh token lookup en O(n) × bcrypt
- **Fichier** : `src/auth/auth.service.ts:113-123, 141-151`
- **Problème** : `bcrypt.hash(refreshToken, 10)` produit un hash non-déterministe → impossible d'utiliser l'index `@unique` sur `tokenHash`. Le service fetch **tous** les tokens actifs du user puis `bcrypt.compare` séquentiellement. Aggravé par l'absence de purge : la table grossit indéfiniment.
- **Fix** : HMAC-SHA256(secret + token) déterministe, indexable. Ajouter un job de cleanup des tokens expirés.

### H4. Utilisateurs Google OAuth créés **sans rôle**
- **Fichier** : `src/auth/social/social-auth.service.ts:36-47`
- **Problème** : `register()` assigne le rôle `user` par défaut ; `SocialAuthService.handleCallback` ne le fait pas. Résultat : `roles: []` → RBAC silencieusement broken pour tous les users OAuth.
- **Fix** : Créer le `UserRole` par défaut dans la branche `create:` du upsert.

### H5. Merge de comptes OAuth par email — risque d'account takeover
- **Fichier** : `src/auth/social/social-auth.service.ts:36-47`
- **Problème** : Le upsert par email lie automatiquement un compte social à un compte password existant. OK pour Google (email vérifié), mais le fichier documente comment ajouter d'autres providers — sans garde-fou. GitHub/Apple/etc. pourraient permettre le takeover d'un compte password via email non vérifié.
- **Fix** : Vérifier `profile.emailVerified === true` avant le upsert.

### H6. Aucune migration Prisma versionnée
- **Fichier** : `prisma/schema.prisma`, `prisma/migrations/` absent
- **Problème** : `prisma migrate deploy` en prod échoue. Chaque install génère son propre historique.
- **Fix** : `npx prisma migrate dev --name init` et committer. Ajouter `prisma migrate deploy` au start prod / Dockerfile.

### H7. Couverture de tests quasi-nulle
- **Fichier** : `src/auth/auth.service.spec.ts` (seul test réel), 5 spec / 78 sources (~6%)
- **Problème** : `register`, `login`, `refresh`, `logout`, `getMe`, tous les guards, `ResourceService`, `PaymentService` non testés.
- **Fix** : Cible pragmatique >70% statements sur `auth/`, `resource/`, `guards/`.

### H8. Tests E2E annoncés mais absents
- **Fichier** : `package.json` référence `./test/jest-e2e.json` inexistant
- **Fix** : Créer `test/jest-e2e.json` + suites (auth flow, RBAC 403, health). Brancher en CI avec Postgres.

### H9. CI incomplète
- **Fichier** : `.github/workflows/ci.yml`
- **Problème** : Manque `test:cov` avec seuils, `test:e2e`, `tsc --noEmit`, `npm audit` / Dependency Review, build Docker, tests SDK, `prettier --check`.
- **Fix** : Jobs séparés `typecheck`, `e2e`, `security`, `docker-build`, `sdk-test`.

### H10. Dockerfile — root user, pas de HEALTHCHECK, pas de `.dockerignore`
- **Fichier** : `Dockerfile`
- **Problème** : Container tourne en `root`. Aucun `.dockerignore` → `.env`, `node_modules`, `.git` peuvent fuiter dans le build context.
- **Fix** : Ajouter `.dockerignore` (`.env*`, `node_modules`, `.git`, `dist`, `coverage`, `.claude`), `USER node`, `HEALTHCHECK` pointant sur `/health`.

---

## 🟡 Moyenne — à planifier

### M1. `OwnershipGuard` mal conçu
- **Fichier** : `src/guards/ownership.guard.ts:31`
- **Problème** : `if (user.id !== resourceId)` ne vérifie pas la propriété d'une **ressource** — seulement que `:id` == user.id. Le nom induit en erreur.
- **Fix** : Renommer `SelfOnlyGuard` OU factory `OwnershipGuardFor(model)` qui charge la ressource et compare `ownerId`.

### M2. `RolesGuard` / `PermissionsGuard` crashent si `req.user` absent
- **Fichier** : `src/guards/roles.guard.ts:33`, `src/guards/permissions.guard.ts:73`
- **Problème** : Accès direct à `user.roles.includes(...)` sans null-check → 500 au lieu de 401 si mauvaise combinaison de décorateurs.
- **Fix** : `if (!user) throw new UnauthorizedException(ErrorCode.UNAUTHORIZED)` avant.

### M3. `STRIPE_WEBHOOK_SECRET` optionnel mais forcé avec `!`
- **Fichier** : `src/payment/payment.service.ts:22-24`, `src/config/env.validation.ts:36`
- **Problème** : Si `STRIPE_SECRET_KEY` défini sans `STRIPE_WEBHOOK_SECRET`, `stripe.webhooks.constructEvent(payload, sig, undefined)` crashe.
- **Fix** : Refinement Zod : `STRIPE_WEBHOOK_SECRET` requis quand `STRIPE_SECRET_KEY` présent.

### M4. Cookie refresh token scopé trop large
- **Fichier** : `src/auth/social/google-auth.controller.ts:64`
- **Problème** : `path: '/api/auth'` envoie le cookie sur login/register/methods alors qu'il n'est utile que sur refresh/logout.
- **Fix** : `path: '/api/auth/refresh'`.

### M5. CORS `origin: true` + `credentials: true` en dev
- **Fichier** : `src/main.ts:42-49`, `src/websocket/ws.adapter.ts:49`
- **Problème** : Sans `CORS_ORIGIN` défini, le serveur reflète l'origin **et** autorise les credentials. N'importe quel site peut faire une requête credentialed contre le dev server.
- **Fix** : Forcer une whitelist explicite, warn bruyamment sinon.

### M6. Aucun rate limit sur le handshake WebSocket
- **Fichier** : `src/websocket/websocket.gateway.ts:109-113`
- **Problème** : `ThrottlerModule` ne couvre que HTTP. Vecteur DoS trivial (JWT verify à chaque tentative).
- **Fix** : Rate limiter par IP dans le middleware Socket.IO (rate-limiter-flexible).

### M7. `WebsocketGateway.emit()` — fan-out coûteux
- **Fichier** : `src/websocket/websocket.gateway.ts:196-219`
- **Problème** : Emit à policy = `fetchSockets()` + iterate sur toutes les sockets connectées. Broadcast dans une boucle → freeze possible.
- **Fix** : Encourager `emitToRoom` avec rooms par-user pré-inscrites au connect.

### M8. Aucun mapping des erreurs Prisma dans le filtre global
- **Fichier** : `src/common/filters/http-exception.filter.ts:37-49`
- **Problème** : `PrismaClientKnownRequestError` (P2002/P2025/P2003) tombe en 500 générique.
- **Fix** : `@Catch(Prisma.PrismaClientKnownRequestError)` dédié : P2002→409, P2025→404, P2003→400.

### M9. Release workflow sans validation avant tag
- **Fichier** : `.github/workflows/release.yml`
- **Fix** : `needs: build` (via `workflow_call` du ci.yml).

### M10. `npm run lint` en CI utilise `--fix`
- **Fichier** : `package.json`, `.github/workflows/ci.yml`
- **Problème** : `--fix` mute silencieusement les violations dans le runner → CI ne fail jamais sur du code corrigeable.
- **Fix** : Séparer `lint` (dev, `--fix`) et `lint:ci` (sans `--fix`, avec `prettier --check`).

### M11. `docker-compose.yml` ne lance pas l'app
- **Fichier** : `docker-compose.yml`
- **Fix** : Ajouter un service `app` avec `depends_on` postgres/redis via `service_healthy`.

### M12. Modules Payment / Queue / Cache / Health non documentés
- **Fichier** : `docs/`, `mkdocs.yml`
- **Fix** : Créer `docs/payment.md`, `docs/queue.md`, `docs/health.md` et les référencer dans `nav:`.

### M13. Seed avec mot de passe admin hardcodé sans garde-fou
- **Fichier** : `prisma/seed.ts`
- **Problème** : `Admin1234!` créé par défaut, aucun check `NODE_ENV`. Un `db:seed` accidentel en prod crée un admin avec credentials publics.
- **Fix** : `SEED_ADMIN_PASSWORD` obligatoire en prod, refuser le seed prod par défaut.

### M14. MCP sans `package.json`, tests, ni sécurisation de session
- **Fichier** : `mcp/src/index.ts`, `.claude/.armature-session.json`
- **Problème** : `saveSession()` écrit tokens en clair avec mode 0644 → exposés aux autres users locaux et sauvegardes.
- **Fix** : `writeFile` avec `{ mode: 0o600 }`. Ajouter `mcp/package.json` + tests.

### M15. ESLint ignore les fichiers de test
- **Fichier** : `eslint.config.mjs`
- **Fix** : Retirer `src/**/*.spec.ts` de `ignores`.

### M16. Datasource Prisma sans `url` explicite + Prisma 7 en avance
- **Fichier** : `prisma/schema.prisma`
- **Problème** : Tooling tiers (Prisma Studio VSCode, extensions) attend souvent `url` dans le schema.
- **Fix** : Ajouter `url = env("DATABASE_URL")` (compatible avec le config file).

---

## 🟢 Basse — cleanup / hygiène

### B1. HTTP logging interceptor logue les query strings
- **Fichier** : `src/common/logger/http-logging.interceptor.ts:37-46`
- **Fix** : Rediger `token`, `password`, `code`, `apiKey` avant log.

### B2. `serialize()` mauvaise signature pour arrays
- **Fichier** : `src/common/utils/serialize.ts:16`
- **Fix** : Surcharger le type OU introduire `serializeMany(cls, arr)`.

### B3. `AuthResponseDto` / `TokensResponseDto` sans `@Expose()`
- **Fichier** : `src/auth/dto/auth-response.dto.ts:33-42`
- **Fix** : Ajouter `@Expose()` sur tous les champs (cohérence avec CLAUDE.md).

### B4. `JwtModule.register({})` sans secret dans `AuthModule`
- **Fichier** : `src/auth/auth.module.ts:14`
- **Fix** : `JwtModule.registerAsync` avec le secret par défaut.

### B5. Google OAuth callback : 2 round-trips DB inutiles
- **Fichier** : `src/auth/social/google-auth.controller.ts:45-49`
- **Fix** : Un seul lookup, réutiliser le résultat.

### B6. `WsExceptionFilter` déclaré 2× (provider + @UseFilters)
- **Fichier** : `src/websocket/websocket.gateway.ts:81`, `src/websocket/websocket.module.ts:56`
- **Fix** : `APP_FILTER` ou `useFactory` pour garantir l'injection unique.

### B7. Pas de script `typecheck`
- **Fichier** : `package.json`
- **Fix** : `"typecheck": "tsc --noEmit"`.

---

## Recommandation d'ordre d'attaque

1. **Sprint 1 (bugs bloquants prod)** : C1, H1, H2, H4, H6
2. **Sprint 2 (sécurité)** : H3, H5, M3, M5, M13, M14
3. **Sprint 3 (fiabilité)** : M1, M2, M6, M8, H7, H8
4. **Sprint 4 (CI/DX)** : H9, H10, M9, M10, M11, M12, M15
5. **Backlog cleanup** : tout le reste (B*)
