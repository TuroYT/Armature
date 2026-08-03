# Audit Armature — correctifs & améliorations proposés

_Audit statique réalisé sur `claude/beautiful-ritchie-y0f80j` (base : `main`
@ `17a7e5d`). Trois passes parallèles : **auth/sécurité**, **WebSocket +
resource**, **infrastructure & cross-cutting**. Findings classés par gravité,
chacun avec un scénario de défaillance concret et un correctif applicable._

---

## Tableau de bord

| # | Titre | Fichier | Gravité | Effort |
|---|-------|---------|:-------:|:------:|
| 1 | OAuth auto-linking → prise de compte | `auth/social/social-auth.service.ts` | 🔴 Critique | M |
| 2 | Aucun email verification à l'inscription | `auth/auth.service.ts` | 🔴 Critique | M |
| 3 | Webhook Stripe cassé (`rawBody` désactivé) | `main.ts` + `payment.controller.ts` | 🔴 Critique | XS |
| 4 | Access token fuité dans l'URL Google callback | `auth/social/google-auth.controller.ts` | 🟠 Haut | S |
| 5 | Pas de `state` CSRF sur le flow Google | `auth/social/google.strategy.ts` | 🟠 Haut | S |
| 6 | Reuse-detection refresh token absent | `auth/auth.service.ts` | 🟠 Haut | S |
| 7 | REST `GET /resources` ignore la policy WS (RLS) | `resource/resource.controller.ts` | 🟠 Haut | S |
| 8 | CORS dev = `origin: true` + `credentials: true` | `websocket/ws.adapter.ts` | 🟠 Haut | XS |
| 9 | `/health` down quand Redis optionnel absent | `health/health.controller.ts` | 🟠 Haut | XS |
| 10 | ThrottlerGuard non fiable derrière un proxy | `main.ts` | 🟠 Haut | XS |
| 11 | `STRIPE_WEBHOOK_SECRET` optionnel mais utilisé avec `!` | `env.validation.ts` | 🟠 Haut | XS |
| 12 | Timing-attack : énumération d'emails au login | `auth/auth.service.ts` | 🟡 Moyen | XS |
| 13 | Refresh/logout scannent tous les tokens en bcrypt (DoS) | `auth/auth.service.ts` | 🟡 Moyen | M |
| 14 | Refresh JWT expiry ≠ DB expiry | `auth/auth.service.ts` | 🟡 Moyen | XS |
| 15 | Pas de discriminant `type` sur les JWT access/refresh | `auth/*` | 🟡 Moyen | XS |
| 16 | `email_verified` Google non vérifié | `auth/social/google.strategy.ts` | 🟡 Moyen | XS |
| 17 | TOCTOU sur update/delete resource | `resource/resource.service.ts` | 🟡 Moyen | S |
| 18 | `WsExceptionFilter` avale les `HttpException` | `websocket/filters/ws-exception.filter.ts` | 🟡 Moyen | XS |
| 19 | `IdParamsDto` accepte n'importe quelle string | `common/dto/params.dto.ts` | 🟡 Moyen | XS |
| 20 | Correlation-ID accepte input client non validé | `common/correlation/correlation-id.middleware.ts` | 🟡 Moyen | XS |
| 21 | `PaginationQueryDto.q` sans MaxLength | `common/dto/pagination-query.dto.ts` | 🟡 Moyen | XS |
| 22 | `CacheService.invalidatePattern` utilise `KEYS` | `cache/cache.service.ts` | 🟡 Moyen | S |
| 23 | Dockerfile : root, pas de HEALTHCHECK, pas de tini | `Dockerfile` + `.dockerignore` manquant | 🟡 Moyen | S |
| 24 | Webhook handler non idempotent + swallowed | `payment/payment.controller.ts` | 🟡 Moyen | S |
| 25 | Signature `serialize()` fausse pour les tableaux | `common/utils/serialize.ts` | 🟢 Bas | XS |
| 26 | `WsPolicyRegistry.register` écrase silencieusement | `websocket/policies/ws-policy.registry.ts` | 🟢 Bas | XS |
| 27 | `OwnershipGuard` compare `user.id` à un `:id` générique | `guards/ownership.guard.ts` | 🟢 Bas | S |
| 28 | `PermissionsGuard` lit les rôles depuis le JWT (stale) | `guards/permissions.guard.ts` | 🟢 Bas | S |
| 29 | i18n : fallback silencieux + fuite de string validator | `common/constants/translations/index.ts` + `http-exception.filter.ts` | 🟢 Bas | S |
| 30 | ESLint parse en CommonJS alors que projet ESM | `eslint.config.mjs` | 🟢 Bas | XS |
| 31 | `tsconfig` sans `strict` global | `tsconfig.json` | 🟢 Bas | M |
| 32 | `test:e2e` pointe sur un config inexistant | `package.json` | 🟢 Bas | S |
| 33 | CI minimal : ni e2e, ni coverage, ni docker build, ni audit | `.github/workflows/ci.yml` | 🟢 Bas | S |
| 34 | Logs HTTP incluent la query string (token, code…) | `common/logger/http-logging.interceptor.ts` | 🟢 Bas | XS |
| 35 | `emit()` policy repose sur `socket.data` en Redis adapter | `websocket/websocket.gateway.ts` | 🟢 Bas | M |
| 36 | Tests : auth.service ≈ 5% couvert, resource/gateway 0% | `src/**/*.spec.ts` | 🟢 Bas | L |

---

## 1. Findings critiques 🔴

### 1.1 OAuth auto-linking → prise de compte

- **Fichier :** `src/auth/social/social-auth.service.ts:36-47`
- **Problème :** `upsert({ where: { email } })` fusionne silencieusement un
  compte OAuth avec un compte password préexistant, sans effacer le
  `passwordHash` ni exiger de preuve de possession de l'email.
- **Scénario :** l'attaquant enregistre `victime@corp.com` via
  `POST /api/auth/register` avec un mot de passe qu'il choisit. Quand la
  vraie victime se connecte plus tard avec Google, les comptes fusionnent.
  Le mot de passe de l'attaquant continue de fonctionner.
- **Correctif :** ne jamais linker automatiquement. Si l'email existe déjà
  avec un `passwordHash`, refuser et exiger un flow `POST /auth/link`
  authentifié (ou une vérification email out-of-band avant la fusion).

### 1.2 Aucun email verification à l'inscription

- **Fichier :** `src/auth/auth.service.ts:49-83`
- **Problème :** `register()` émet immédiatement des tokens pour n'importe
  quel email non vérifié. C'est la faille racine qui active #1.1.
- **Correctif :** ajouter `emailVerifiedAt` sur `User`, bloquer les actions
  sensibles et le linking OAuth tant qu'il n'est pas set, envoyer un mail
  de vérification à `register()`.

### 1.3 Webhook Stripe cassé — `rawBody` jamais activé

- **Fichier :** `src/main.ts:26` + `src/payment/payment.controller.ts:50-58`
- **Problème :** `NestFactory.create(AppModule, { bufferLogs: true })` oublie
  `rawBody: true`, mais `payment.controller.ts` lit `req.rawBody!` pour
  `stripe.webhooks.constructEvent`.
- **Scénario :** chaque webhook Stripe → `constructEvent(undefined, …)` →
  throw → 400. Les provisionings s'arrêtent silencieusement.
- **Correctif :**
  ```ts
  NestFactory.create(AppModule, { bufferLogs: true, rawBody: true });
  ```

---

## 2. Findings hauts 🟠

### 2.1 Access token fuité dans l'URL du callback Google

- **Fichier :** `src/auth/social/google-auth.controller.ts:68-72`
- **Problème :** `redirect.searchParams.set('accessToken', tokens.accessToken)`
  → le token part dans l'historique navigateur, le `Referer`, les logs
  proxy, l'analytics.
- **Correctif :** poser un cookie HttpOnly + SameSite=Lax court, laisser le
  front l'échanger via `/auth/refresh` — ou renvoyer un HTML self-submitting
  POST.

### 2.2 Pas de `state` CSRF sur le flow Google OAuth

- **Fichier :** `src/auth/social/google.strategy.ts:26-33`
- **Problème :** Passport n'a pas `state: true` ; login-CSRF possible.
- **Correctif :** `super({ ..., state: true })` + activer une session Express
  scope OAuth (ou basculer sur PKCE).

### 2.3 Refresh-token reuse ne révoque pas la famille

- **Fichier :** `src/auth/auth.service.ts:109-139`
- **Problème :** en cas de replay d'un refresh volé, on lève juste 401. La
  session légitime survit → vol non détecté.
- **Correctif :** sur no-match, `deleteMany({ where: { userId } })` (RFC 6749
  reuse-detection). Combiner idéalement avec un `jti` par famille.

### 2.4 REST bypass la policy WS (row-level)

- **Fichier :** `src/resource/resource.controller.ts:57-70`
- **Problème :** `GET /api/resources[/:id]` n'a ni guard ni filtre owner. La
  `ResourceWsPolicy` restreint pourtant les events `resource:*` à admin ou
  owner. Un user récupère en REST ce que la WS lui refuse.
- **Correctif :** `@RequirePermissions('resources:read')` + filtrer les
  queries Prisma par `ownerId` pour les non-admin.

### 2.5 CORS dev = `origin: true` + `credentials: true`

- **Fichier :** `src/websocket/ws.adapter.ts:44-51`
- **Problème :** dès qu'`NODE_ENV !== production` et `CORS_ORIGIN` non set,
  n'importe quel site peut ouvrir un handshake WS crédentialé.
- **Correctif :** rendre `CORS_ORIGIN` obligatoire (fail-fast dans
  `env.validation.ts`) ou utiliser une allowlist `http://localhost:*` en dev.

### 2.6 `/health` renvoie 503 quand Redis optionnel absent

- **Fichier :** `src/health/health.controller.ts:41-44`
- **Problème :** `checkRedis()` renvoie `status: 'down'` dès que
  `cache.isAvailable` est faux, alors que `REDIS_URL` est documenté comme
  optionnel. Les probes k8s flappent.
- **Correctif :** distinguer "non configuré" et "configuré mais injoignable".
  Renvoyer `up` (ou skip) quand `REDIS_URL` est vide.

### 2.7 `ThrottlerGuard` non fiable derrière un proxy

- **Fichier :** `src/main.ts` (pas de `trust proxy`)
- **Problème :** en production, toutes les requêtes portent l'IP du reverse
  proxy → un seul bucket global → soit rate-limit trivial à contourner via
  header spoof, soit un client hostile bloque tout le monde.
- **Correctif :** `app.set('trust proxy', 1)` + éventuellement custom
  `throttlers[].getTracker`.

### 2.8 `STRIPE_WEBHOOK_SECRET` optionnel mais consommé avec `!`

- **Fichier :** `src/payment/payment.service.ts:22-24` +
  `src/config/env.validation.ts:35-36`
- **Correctif :** dans le Zod schema, `superRefine` : si
  `STRIPE_SECRET_KEY` set, alors `STRIPE_WEBHOOK_SECRET` requis. Idem pour
  `GOOGLE_CLIENT_ID` / `SECRET`.

---

## 3. Findings moyens 🟡

### 3.1 Timing-attack : énumération d'emails

- **Fichier :** `src/auth/auth.service.ts:86-96`
- **Problème :** `login()` retourne sans `bcrypt.compare` si le user est
  inconnu → gap ~100ms vs ~1ms observable.
- **Correctif :** faire un `bcrypt.compare(dto.password, DUMMY_HASH)`
  factice sur la branche "user absent / OAuth-only" et renvoyer la même
  erreur générique.

### 3.2 Refresh/logout : DoS par accumulation de tokens

- **Fichier :** `src/auth/auth.service.ts:113-152`
- **Problème :** `refresh()` et `logout()` itèrent tous les rows et font
  `bcrypt.compare` (10 rounds) sur chacun. `logout()` ne filtre pas
  `expiresAt`. Aucune purge, aucun cap. À N=200 rows, ≈ 2s CPU par appel.
- **Correctif :** embarquer le `RefreshToken.id` comme `jti` dans le JWT
  refresh → lookup O(1) sur `where: { id: jti, userId }`. Purger les
  expirés à chaque write. Cap sessions/user.

### 3.3 Refresh JWT expiry ≠ DB expiry

- **Fichier :** `src/auth/auth.service.ts:234`
- **Problème :** `expiresAt = now + 7 jours` en dur, alors que le JWT
  respecte `JWT_REFRESH_EXPIRES_IN`. Si l'opérateur set `30d`, refresh
  retourne 401 après 7j sans explication.
- **Correctif :** dériver l'`expiresAt` DB depuis `JWT_REFRESH_EXPIRES_IN`
  (ou depuis l'`exp` du JWT signé).

### 3.4 Pas de discriminant `type` sur les JWT

- **Fichier :** `src/auth/auth.service.ts:220-231` + strategies
- **Problème :** payload identique `{ sub, email, roles }`. Si un opérateur
  unifie par erreur les secrets, un access token peut rotationner un
  refresh.
- **Correctif :** ajouter `type: 'access' | 'refresh'` + `jti`, rejeter le
  mauvais type dans `validate()`.

### 3.5 `email_verified` Google non vérifié

- **Fichier :** `src/auth/social/google.strategy.ts:42-54`
- **Correctif :** `if (!profile._json?.email_verified) return done(new Error(...));`

### 3.6 TOCTOU sur `update` / `remove` resource

- **Fichier :** `src/resource/resource.service.ts:83-114`
- **Correctif :** `prisma.resource.update({ where: { id, ownerId: userId } })`
  (ou `OR: [{ ownerId }, {…admin bypass}]`), mapper `P2025` → 404/403.

### 3.7 `WsExceptionFilter` avale les `HttpException` et les payloads objets

- **Fichier :** `src/websocket/filters/ws-exception.filter.ts:46-64`
- **Problèmes cumulés :**
  - Un `throw new ForbiddenException(ErrorCode.FORBIDDEN)` dans un handler
    WS est renvoyé au client comme `INTERNAL_SERVER_ERROR`.
  - `throw new WsException({ code, details })` est downgradé en
    `BAD_REQUEST`.
- **Correctif :** brancher sur `HttpException` (lire
  `getResponse()`/`getStatus()`), et si `error` est un objet avec `code`,
  utiliser `error.code` + propager `details`.

### 3.8 `IdParamsDto` accepte n'importe quelle string

- **Fichier :** `src/common/dto/params.dto.ts:8-13`
- **Correctif :** `@IsUUID()` (ou `@Matches(cuidRegex)`) selon le type d'`id`
  du schéma Prisma.

### 3.9 `x-correlation-id` client accepté tel quel

- **Fichier :** `src/common/correlation/correlation-id.middleware.ts:18-24`
- **Problème :** log-injection, header smuggling, header géant.
- **Correctif :** valider longueur + regex UUID-ish, sinon générer.

### 3.10 `PaginationQueryDto.q` sans `MaxLength`

- **Fichier :** `src/common/dto/pagination-query.dto.ts:22-24`
- **Problème :** un `ILIKE '%…%'` avec 10 MB en boucle pin Postgres.
- **Correctif :** `@MaxLength(100) @Transform(({ value }) => value?.trim())`.

### 3.11 `CacheService.invalidatePattern` utilise `KEYS`

- **Fichier :** `src/cache/cache.service.ts:104-115`
- **Problème :** O(N), bloque l'event loop Redis.
- **Correctif :** utiliser `SCAN` (cursor) + pipeline les `DEL` par chunks
  de 100.

### 3.12 Dockerfile : root, pas de HEALTHCHECK, pas de tini, `.dockerignore` manquant

- **Fichiers :** `Dockerfile`, absence de `.dockerignore`
- **Correctifs :**
  - `USER node`
  - `HEALTHCHECK CMD wget -qO- http://localhost:3000/health || exit 1`
  - `dumb-init` en PID 1 pour propager SIGTERM
  - créer `.dockerignore` (`.env`, `node_modules`, `.git`, `docs`, `mcp`,
    `sdk`, `*.md`, `coverage`, `test`)
  - `npm ci --omit=dev --ignore-scripts` dans le stage runner.

### 3.13 Webhook handler non idempotent + errors swallowed

- **Fichier :** `src/payment/payment.controller.ts:50-59`
- **Correctif :** table `StripeEvent(id UNIQUE)` pour dédupliquer, try/catch
  autour du handler, enqueue via BullMQ pour découpler.

---

## 4. Findings bas 🟢

### 4.1 `serialize()` — signature fausse pour les tableaux

- **Fichier :** `src/common/utils/serialize.ts:16-18`
- **Correctif :** overload —
  ```ts
  function serialize<T>(cls: ClassConstructor<T>, plain: unknown[]): T[];
  function serialize<T>(cls: ClassConstructor<T>, plain: object): T;
  ```
  et supprimer les `as unknown as T[]` en aval.

### 4.2 `WsPolicyRegistry.register` écrase silencieusement

- **Fichier :** `src/websocket/policies/ws-policy.registry.ts:86-98`
- **Correctif :** `warn` (ou throw en mode strict) si la clé existe déjà.

### 4.3 `OwnershipGuard` — équivalence user.id ↔ `:id` trop générique

- **Fichier :** `src/guards/ownership.guard.ts:26-32`
- **Correctif :** renommer `SelfIdGuard`, ou paramétrer via
  `@OwnershipParam('userId')`.

### 4.4 `PermissionsGuard` — rôles lus depuis le JWT (stale jusqu'à 5min de cache + JWT lifetime)

- **Fichier :** `src/guards/permissions.guard.ts:110-112`
- **Correctif :** résoudre depuis `UserRole` en DB (ou raccourcir
  drastiquement les access tokens + invalider le cache à la révocation).

### 4.5 i18n — fallback silencieux + fuite de contraintes class-validator

- **Fichiers :** `src/common/constants/translations/index.ts:19-21`,
  `src/common/filters/http-exception.filter.ts`
- **Correctif :** logger warn (dev) sur miss ; normaliser les erreurs
  class-validator en `BAD_REQUEST` + `fieldErrors[]` structurés au lieu de
  laisser passer les strings en clair.

### 4.6 ESLint parse en CommonJS

- **Fichier :** `eslint.config.mjs:20`
- **Correctif :** `sourceType: 'module'` (le projet est déjà `"type": "module"`).

### 4.7 `tsconfig` sans `strict` global

- **Fichier :** `tsconfig.json:18-22`
- **Correctif :** activer `strict: true`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `exactOptionalPropertyTypes` et nettoyer.

### 4.8 `test:e2e` — config inexistante

- **Fichier :** `package.json:23`, dossier `test/` absent.
- **Correctif :** scaffolder `test/jest-e2e.json` + un smoke test
  `/health`, l'inclure dans la CI. Sinon supprimer le script.

### 4.9 CI minimale

- **Fichier :** `.github/workflows/ci.yml`
- **Correctif :** ajouter e2e (après #4.8), `npm audit --production
  --audit-level=high`, un job `docker build` de sanity, upload de coverage.

### 4.10 Logs HTTP incluent `originalUrl` (query string)

- **Fichier :** `src/common/logger/http-logging.interceptor.ts:24,38-46`
- **Problème :** `?token=…`, `?code=…`, `?access_token=…` finissent en clair
  dans les logs (Google callback, invitations…).
- **Correctif :** logger `req.route?.path` ou masquer une allowlist
  (`token`, `code`, `access_token`, `refresh_token`).

### 4.11 `emit()` policy — fragile en adapter Redis / cluster

- **Fichier :** `src/websocket/websocket.gateway.ts:196-219`
- **Problème :** `fetchSockets()` renvoie des `RemoteSocket` dont `data`
  n'est propagé que par certains adapters. Passage au cluster → moitié des
  events perdus silencieusement.
- **Correctif :** émettre dans des rooms par user (`user:${id}`) et laisser
  Socket.IO faire le fan-out ; ou vérifier au boot que
  `Adapter.remoteSockets()` propage `data`, sinon warn.

### 4.12 Couverture tests

- **Fichiers :** 5 spec files pour 78 fichiers TS.
- **Priorités à couvrir :**
  1. `auth.service` : rotation, wrong-password (timing), reuse-detection,
     logout idempotent.
  2. `resource.service` / `resource.controller` : ownership refusé, admin
     bypass, pagination limites.
  3. `websocket.gateway.authenticateSocket` : header vs auth field, token
     absent/expiré/malformé.
  4. `websocket.gateway.emit` : filtrage par policy, room policy denial.
  5. `WsExceptionFilter` : branches WsException string vs object,
     HttpException, exception inconnue.
  6. `ws.adapter` : matrice CORS (dev/prod × set/unset).

---

## 5. Plan de livraison suggéré

**Sprint 1 — Sécurité bloquante** (≈ 1-2 j)
- #1.1, #1.2 (verification + refus auto-link)
- #1.3 (rawBody Stripe — 1 ligne)
- #2.1, #2.2, #2.3 (cookie HttpOnly, state CSRF, reuse-detection)
- #2.5 (CORS strict)
- #2.7 (trust proxy)

**Sprint 2 — Robustesse** (≈ 2-3 j)
- #2.4 (RLS REST cohérente avec la WS policy)
- #2.6 (healthcheck)
- #2.8 + #3.4 + #3.5 (env schema + type JWT + email_verified)
- #3.2 + #3.3 (refactor RefreshToken → jti, expiry dérivée)
- #3.7, #3.8, #3.9, #3.10 (filter WS + DTO validation cap)
- #3.13 (idempotence Stripe)

**Sprint 3 — Qualité & infra** (≈ 2 j)
- #3.11 (SCAN)
- #3.12 (Dockerfile + .dockerignore)
- #4.6, #4.7, #4.8, #4.9 (ESLint, tsconfig, e2e, CI)
- #4.5 (i18n normalisée)
- #4.10 (log scrubbing)

**Sprint 4 — Tests** (≈ 3 j)
- #4.12 (couvrir en priorité les 6 zones listées).

---

_Généré par un audit statique multi-passes. Les scénarios de défaillance
sont extraits par lecture ligne-à-ligne, pas exécutés — chaque finding
mérite une validation rapide avant fix._
