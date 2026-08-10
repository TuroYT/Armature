# Audit Armature — Correctifs & Améliorations

> Revue structurée du projet **Armature** (NestJS 11 + Prisma + Socket.IO).
> Analyse produite sur la branche `claude/beautiful-ritchie-2jjlxi`.
> Chaque point cite le fichier et la ligne concernés pour navigation directe.

Les items sont classés par **sévérité** puis par **effort** afin de faciliter
la priorisation. Un tableau récapitulatif se trouve en fin de document.

Légende sévérité : 🔴 critique · 🟠 majeur · 🟡 mineur · 🔵 amélioration

---

## 1. Sécurité & correction (priorité maximale)

### 🔴 1.1 — Webhook Stripe cassé : `rawBody` jamais activé

**Fichier :** `src/main.ts:26`, `src/payment/payment.controller.ts:55`

`PaymentController.webhook()` lit `req.rawBody!` (avec assertion `!`) pour
vérifier la signature Stripe, mais `NestFactory.create(AppModule)` n'est
**pas** appelé avec `{ rawBody: true }`. Résultat : `req.rawBody` est
`undefined` en production, `constructWebhookEvent` lance systématiquement
`BadRequest`, aucune notification Stripe n'est traitée.

**Correctif :**
```ts
// main.ts
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  rawBody: true,        // ← indispensable pour Stripe
});
```

### 🔴 1.2 — Rotation refresh token : durée codée en dur

**Fichier :** `src/auth/auth.service.ts:234`

```ts
const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
```

La durée d'expiration stockée en BDD est **fixée à 7 j**, indépendamment de
`JWT_REFRESH_EXPIRES_IN`. Si l'admin passe la variable à `30d`, la BDD
supprimera quand même les tokens au bout de 7 j. Divergence silencieuse
entre le JWT et son enregistrement de révocation.

**Correctif :** dériver `expiresAt` du champ `exp` du JWT signé (ou parser
`JWT_REFRESH_EXPIRES_IN` avec `ms`).

### 🔴 1.3 — Refresh token : scan bcrypt O(n) par session

**Fichier :** `src/auth/auth.service.ts:113-123` (`refresh`), `src/auth/auth.service.ts:141-151` (`logout`)

À chaque refresh, on charge **tous les refresh tokens actifs du user** puis
on lance `bcrypt.compare` en boucle. Un utilisateur avec 20 sessions
(mobile, desktop, tablettes) déclenche 20 opérations bcrypt (~200 ms cumulés)
à chaque rafraîchissement. Vecteur DoS trivial (créer 200 sessions, faire
tourner /refresh).

**Correctif :** ajouter un champ `jti` (JWT ID) dans le payload signé et un
index unique en BDD :

```prisma
model RefreshToken {
  jti       String   @unique   // clé de lookup
  tokenHash String              // toujours hashé pour anti-vol
  ...
}
```

`refresh()` devient alors une lookup O(1) puis un unique `bcrypt.compare`.

### 🔴 1.4 — Pas de détection de réutilisation de refresh token

**Fichier :** `src/auth/auth.service.ts:125-127`

Quand un refresh token invalide est présenté, le comportement standard
industriel (OWASP, Auth0) est de **révoquer toutes les sessions du user**
car un token invalide = probable vol/rejeu. Ici on se contente de renvoyer
`401` : l'attaquant peut retenter avec un autre token volé.

**Correctif :** si la présentation d'un JWT `sub` connu échoue au lookup,
supprimer **tous** les `RefreshToken` du `userId` et logguer l'événement.

### 🔴 1.5 — `OwnershipGuard` incorrect / trompeur

**Fichier :** `src/guards/ownership.guard.ts:31`

```ts
if (user.id !== resourceId) throw new ForbiddenException(...);
```

Le guard compare `user.id` avec le paramètre `:id` de la route. Ce n'est
pas un contrôle de « possession de ressource », c'est un contrôle
« l'URL contient MON id ». Sur une route type `/api/resources/:id`,
cela autoriserait un utilisateur uniquement si son id vaut l'id de la
ressource — sémantiquement absurde.

Le CLAUDE.md documente pourtant ce guard comme « Resource ownership ».
Deux options :
- Renommer en `SelfOrAdminGuard` (usage réel : routes `/users/:id/...`).
- Le remplacer par un guard générique paramétré : `@OwnershipOf('resource', 'ownerId')` qui interroge la BDD.

### 🟠 1.6 — `STRIPE_WEBHOOK_SECRET` optionnel mais requis à l'exécution

**Fichier :** `src/config/env.validation.ts:35`, `src/payment/payment.service.ts:22-24`

`STRIPE_WEBHOOK_SECRET` est déclaré `.optional()` dans le schéma Zod, mais
`PaymentService.constructor` fait `config.get(..)!` (assertion non-null).
Si Stripe est activé sans le secret, le webhook lèvera une erreur cryptique
à la première requête.

**Correctif :** ajouter un `superRefine` Zod :
```ts
.superRefine((env, ctx) => {
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) {
    ctx.addIssue({ path: ['STRIPE_WEBHOOK_SECRET'],
      code: 'custom', message: 'requis quand STRIPE_SECRET_KEY est défini' });
  }
  if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) { /* idem */ }
});
```

### 🟠 1.7 — `CorrelationIdMiddleware` : header entrant non validé

**Fichier :** `src/common/correlation/correlation-id.middleware.ts:19-22`

```ts
const inbound = req.headers[HEADER];
const correlationId = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID();
```

Un client peut injecter un `X-Correlation-Id` arbitraire (10 000 caractères,
caractères de contrôle, injection de log si le formatter n'échappe pas). En
zone publique, il faut **borner longueur et charset**.

**Correctif :**
```ts
const SAFE = /^[A-Za-z0-9._-]{1,128}$/;
const correlationId = typeof inbound === 'string' && SAFE.test(inbound)
  ? inbound : randomUUID();
```

### 🟠 1.8 — `LoginDto.password` avec `@MinLength(8)`

**Fichier :** `src/auth/dto/login.dto.ts:10`

Une règle de complexité de mot de passe sur le **DTO de login** empêche
tout utilisateur ayant un legacy password de moins de 8 caractères de se
connecter. La règle doit vivre uniquement sur `RegisterDto` / changement
de mot de passe.

**Correctif :** garder `@IsString()` seul sur `LoginDto`.

### 🟠 1.9 — Flux Google OAuth : refresh token inaccessible côté frontend

**Fichier :** `src/auth/social/google-auth.controller.ts:60-72`

Le refresh token est posé dans un cookie **HttpOnly** scopé sur
`/api/auth`. Or `/api/auth/refresh` (via `JwtRefreshStrategy`) le lit
depuis `req.body.refreshToken`, pas depuis le cookie. Le frontend ne
peut pas relire un cookie HttpOnly → refresh **impossible** pour les
comptes Google.

**Correctifs possibles :**
- Étendre `JwtRefreshStrategy` : `ExtractJwt.fromExtractors([fromCookie, fromBody])`.
- Ou renvoyer aussi le `refreshToken` en query (moins sécurisé, à éviter).

### 🟡 1.10 — Suppression du token avant émission du nouveau

**Fichier :** `src/auth/auth.service.ts:135-138`

`refresh()` supprime le token courant puis appelle `generateAndStoreTokens`.
Si la seconde opération échoue (JWT signing, Prisma), l'utilisateur perd
sa session sans en obtenir de nouvelle.

**Correctif :** envelopper dans un `prisma.$transaction` ou insérer
d'abord le nouveau, supprimer ensuite.

### 🟡 1.11 — `bcrypt.hash(refreshToken, 10)` vs password `12`

**Fichier :** `src/auth/auth.service.ts:55, 233`

Coûts bcrypt incohérents (10 pour refresh token, 12 pour mot de passe).
Pour un refresh token à haute entropie, cost 10 est probablement
sur-dimensionné. Le point 1.3 (jti + lookup direct) rend ce hash
principalement une défense en profondeur — cost 6-8 suffit.

---

## 2. Correction fonctionnelle

### 🟠 2.1 — `CorrelationIdMiddleware.forRoutes('*')` — Express 5 breaking change

**Fichier :** `src/app.module.ts:64`

NestJS 11 s'appuie sur Express 5 qui a supprimé le wildcard implicite `*`
pour `path-to-regexp` v6. Le pattern `'*'` peut lever `TypeError: Missing
parameter name` au démarrage selon la version d'Express. Préférer :

```ts
consumer.apply(CorrelationIdMiddleware)
  .forRoutes({ path: '*splat', method: RequestMethod.ALL });
// ou
  .forRoutes({ path: '(.*)', method: RequestMethod.ALL });
```

### 🟠 2.2 — Aucune invalidation cache des permissions

**Fichier :** `src/guards/permissions.guard.ts:125-129`

Le TTL de 5 min est le seul mécanisme d'expiration. Un admin qui retire
la permission `resources:delete` à un utilisateur devra attendre jusqu'à
5 min avant que la restriction soit effective. Le code invite à appeler
`CacheService.del('permissions:{userId}')` mais **aucune route ne le fait**
car il n'y a pas de UsersService.

**Correctif :** exposer un `UsersService.updateRoles()` qui invalide la
clé après chaque write, ou publier un event `user.roles.changed` sur un
EventEmitter écouté par le guard.

### 🟡 2.3 — `CacheService.invalidatePattern` utilise `KEYS`

**Fichier :** `src/cache/cache.service.ts:107`

`Redis KEYS` bloque le thread principal sur toute la base — c'est
explicitement déconseillé en production. À remplacer par `SCAN` :

```ts
const pipeline = this.client.pipeline();
for await (const keys of this.client.scanStream({ match: pattern, count: 100 })) {
  if (keys.length) pipeline.del(...keys);
}
await pipeline.exec();
```

Alternative : supprimer la méthode (aucun appelant actuel).

### 🟡 2.4 — WebSocket : pas de graceful close BullMQ

**Fichier :** `src/queue/queue.module.ts`, `src/queue/example.processor.ts`

Aucun `onModuleDestroy` sur les workers BullMQ. À l'arrêt, les jobs en
cours peuvent être requeue-és sans état propre. Idem pour le
`WebsocketGateway` : `handleDisconnect` est vide, aucune fermeture
explicite du serveur Socket.IO au shutdown.

**Correctif :** activer `app.enableShutdownHooks()` dans `main.ts` puis
implémenter `OnModuleDestroy` sur les composants concernés.

### 🟡 2.5 — `AuthService.register` : race condition sur email unique

**Fichier :** `src/auth/auth.service.ts:50-53`

`findUnique` + `create` séparés : deux requêtes concurrentes avec le
même email peuvent passer le check. Le second `create` lèvera un `P2002`
non traité → 500 au lieu de 409.

**Correctif :** enrober dans un try/catch avec mapping `P2002 → ConflictException`, et **retirer** le `findUnique` préalable (le check devient
implicite via la contrainte unique).

---

## 3. Performance

### 🟡 3.1 — `WebsocketGateway.emit` : O(n) sur chaque broadcast

**Fichier :** `src/websocket/websocket.gateway.ts:196-219`

`fetchSockets()` + policy per-socket sur chaque émission. Pour une flotte
de 10 000 sockets et 10 événements/s, on parle de 100 000 évaluations/s.

**Piste :** indexer les sockets par `userId` dans une `Map` maintenue
via `handleConnection` / `handleDisconnect` ; les events avec policy
n'itèrent alors que les sockets **potentiellement destinataires** au lieu
de tous.

### 🔵 3.2 — `ResourceService.findAll` : deux requêtes séparées

**Fichier :** `src/resource/resource.service.ts:58-66`

Le `$transaction([findMany, count])` fait deux allers-retours. Une seule
requête avec `COUNT(*) OVER()` (window function Postgres) élimine le
second round-trip :

```ts
const rows = await this.prisma.$queryRaw`
  SELECT *, COUNT(*) OVER() AS full_count
  FROM resources ${where} ORDER BY ... LIMIT ${limit} OFFSET ${skip}`;
```

Peu critique tant que la table reste petite.

---

## 4. Qualité de code & typage

### 🟡 4.1 — Extraction `request.user` dupliquée dans 3 guards

**Fichier :** `src/guards/roles.guard.ts:32-35`, `src/guards/permissions.guard.ts:73-76`, `src/guards/ownership.guard.ts:22-25`

Chaque guard fait :
```ts
const user = (request as unknown as Record<string, unknown>)['user'] as AuthUser;
```

À factoriser dans `src/common/utils/get-request-user.ts` :
```ts
export function getRequestUser(ctx: ExecutionContext): AuthUser {
  return ctx.switchToHttp().getRequest<Request & { user: AuthUser }>().user;
}
```

### 🟡 4.2 — `serialize()` mal typée pour les tableaux

**Fichier :** `src/common/utils/serialize.ts`

Signature `<T>(cls, plain) => T` : appelée avec un tableau, elle retourne
`T` alors que la valeur réelle est `T[]`. Chaque appelant doit caster :
```ts
data: serialize(ResourceResponseDto, items) as unknown as ResourceResponseDto[]
```

**Correctif :** overloads de fonction.
```ts
export function serialize<T>(cls: ClassConstructor<T>, plain: unknown[]): T[];
export function serialize<T>(cls: ClassConstructor<T>, plain: unknown): T;
export function serialize<T>(cls: ClassConstructor<T>, plain: unknown): T | T[] {
  return plainToInstance(cls, plain, { excludeExtraneousValues: true });
}
```

### 🔵 4.3 — `AuthService.refresh` : re-fetch user après vérification

**Fichier :** `src/auth/auth.service.ts:129-132`

Un `findMany` est déjà fait sur `RefreshToken` avec `userId`. On pourrait
inclure `user.userRoles.role` dans ce même `findMany` (relation `token.user`)
et économiser la requête suivante.

### 🔵 4.4 — `HttpExceptionFilter` : `path` peut fuiter query params sensibles

**Fichier :** `src/common/filters/http-exception.filter.ts:79`

`request.url` inclut la query string complète. Si une route logue une
exception avec `?apiKey=xxx`, la clé se retrouve dans la réponse d'erreur
+ les logs. À nettoyer via une whitelist ou utiliser `request.route.path`.

### 🔵 4.5 — `LoggerService.withContext` : instancie un nouveau Logger à chaque appel

**Fichier :** `src/common/logger/logger.service.ts:34-39`

`new LoggerService(this.adapter)` sans passer par le container DI. C'est
OK ici, mais on multiplie les instances (une par appel dans le constructeur
d'un service). À cacher dans une `Map<string, LoggerService>`.

---

## 5. Tests

### 🟠 5.1 — Couverture très faible

Actuellement 4 spec files : `auth.service`, `serialize`, `translations`,
`ws-jwt.guard`, `ws-policy.registry`. Manquent notamment :

| Module | Priorité | Justification |
|---|---|---|
| `AuthService.refresh` (rotation) | 🔴 | Sécurité — cf. §1.3 & §1.4 |
| `PermissionsGuard` (cache hit/miss/corrompu) | 🟠 | Complexité + branchement Redis |
| `PaymentService.constructWebhookEvent` | 🟠 | Signature Stripe |
| `WebsocketGateway.emit` avec policies | 🟠 | Sécurité — row-level |
| `HttpExceptionFilter` (i18n, non-HTTP) | 🟡 | Format de réponse contractuel |
| `CorrelationIdMiddleware` (header safe) | 🟡 | Cf. §1.7 |

### 🟠 5.2 — Aucun test e2e

Le script `test:e2e` pointe vers `./test/jest-e2e.json` **inexistant** —
le dossier `test/` n'existe pas. Le script échouera immédiatement.

**Correctifs :**
- Retirer le script tant qu'il n'y a pas de suite.
- Ou créer un scaffold `test/jest-e2e.json` + `app.e2e-spec.ts` (login → CRUD resource → logout).

---

## 6. DevOps & DX

### 🟡 6.1 — Pas de dossier `prisma/migrations/`

Le projet fournit `schema.prisma` mais **aucune migration baseline**.
Les utilisateurs doivent faire `prisma migrate dev --name init` — au
premier `npm ci` en CI ou en Docker sans BDD, la commande échoue.
`prisma db push` est utilisé implicitement (schéma → BDD sans historique)
ce qui casse le workflow de rollback.

**Correctif :** générer et committer la migration baseline.

### 🟡 6.2 — Dockerfile : pas de `.dockerignore` visible

`ls -la` ne montre pas de `.dockerignore`. `COPY . .` copie donc `node_modules`,
`.git`, `dist` locaux, etc. — image plus grosse et non déterministe.

### 🟡 6.3 — `npm run prepare = "husky"` casse CI sans git

Dans un runner sans dépôt initialisé, `husky` échoue. Sécuriser :
`"prepare": "husky install || true"` ou `"prepare": "node .husky/install.js || true"`.

### 🔵 6.4 — Pas de script `typecheck` séparé de `build`

Utile en CI pour découpler validation TS de la génération de dist.
```json
"typecheck": "tsc --noEmit -p tsconfig.build.json"
```

### 🔵 6.5 — `start:prod` pointe vers `dist/src/main.js`

Le chemin `src/main.js` révèle que la structure du dist n'est pas
aplatie — vérifier que la génération de Prisma (`generated/prisma/`)
est bien intégrée dans l'image et que les imports relatifs `../../generated/`
résolvent bien depuis `/app/dist/src/`.

---

## 7. Documentation

### 🔵 7.1 — `.env.example` omet la conditionnalité des vars optionnelles

Aucune indication que `STRIPE_WEBHOOK_SECRET` devient **obligatoire** si
`STRIPE_SECRET_KEY` est défini (cf. §1.6). À documenter en commentaire
inline.

### 🔵 7.2 — `docs/authentication.md` ne mentionne pas le flux Google refresh (bug §1.9)

À aligner après correction.

### 🔵 7.3 — README ne cite pas les scripts utiles

`db:seed`, `db:studio`, `test:cov` sont absents du README (revoir §
Getting started).

---

## 8. Récapitulatif priorisé

| # | Item | Sévérité | Effort | Impact |
|---|---|:---:|:---:|:---:|
| 1.1 | Stripe webhook : `rawBody: true` manquant | 🔴 | S | Bloquant paiement |
| 1.2 | Refresh token expiresAt codé en dur (7d) | 🔴 | S | Sécurité / prévisibilité |
| 1.3 | Refresh scan bcrypt O(n) → jti + index | 🔴 | M | Perf + DoS |
| 1.4 | Détection réutilisation refresh token | 🔴 | S | Sécurité (OWASP) |
| 1.5 | `OwnershipGuard` incorrect | 🔴 | S | Sécurité / confusion |
| 1.6 | `STRIPE_WEBHOOK_SECRET` conditionnel | 🟠 | S | DX / crash tardif |
| 1.7 | Validation header `X-Correlation-Id` | 🟠 | S | Log injection |
| 1.8 | Retirer `@MinLength(8)` de `LoginDto` | 🟠 | S | Legacy accounts |
| 1.9 | Refresh Google impossible (cookie HttpOnly) | 🟠 | S | Bug fonctionnel |
| 1.10 | `refresh()` non transactionnel | 🟡 | S | Session lost si crash |
| 2.1 | Middleware `forRoutes('*')` Express 5 | 🟠 | S | Startup crash possible |
| 2.2 | Invalidation cache permissions | 🟠 | M | Lag privilèges 5 min |
| 2.3 | `invalidatePattern` : `KEYS` → `SCAN` | 🟡 | S | Perf Redis |
| 2.4 | Graceful shutdown BullMQ / WS | 🟡 | S | Robustesse deploy |
| 2.5 | Race register email unique | 🟡 | S | 500 vs 409 |
| 3.1 | WS `emit` O(n) → index par userId | 🟡 | M | Scalabilité real-time |
| 3.2 | `findAll` : COUNT OVER() | 🔵 | S | 1 round-trip |
| 4.1 | Factoriser `getRequestUser` | 🟡 | S | Duplication |
| 4.2 | Overloads `serialize()` | 🟡 | S | Type safety |
| 4.4 | `HttpExceptionFilter` : fuite query params | 🔵 | S | Log hygiene |
| 5.1 | Ajouter specs refresh/permissions/stripe | 🟠 | L | Confiance modifs |
| 5.2 | Script e2e cassé | 🟠 | S | CI faux positif |
| 6.1 | Baseline migration Prisma manquante | 🟡 | S | Onboarding |
| 6.2 | `.dockerignore` manquant | 🟡 | S | Image size |
| 6.3 | `husky` échoue sans git | 🟡 | S | CI robustness |

**Effort** : S = < 1 h, M = 1-4 h, L = > 4 h.

---

## 9. Plan proposé (3 sprints indicatifs)

### Sprint 1 — Sécurité bloquante (½ jour)
Items 1.1, 1.2, 1.4, 1.5, 1.8, 1.9, 2.5, 5.2.

### Sprint 2 — Robustesse & scalabilité (2 jours)
Items 1.3, 1.6, 1.7, 1.10, 2.1, 2.2, 2.3, 2.4, 4.1, 4.2.

### Sprint 3 — Couverture & polish (2 jours)
Items 3.1, 3.2, 4.4, 4.5, 5.1, 6.1, 6.2, 6.3, 7.x.

---

*Généré automatiquement — les items 1.1 et 1.5 sont recommandés à traiter
en priorité (bug fonctionnel bloquant + risque de mauvaise interprétation
sécurité).*
