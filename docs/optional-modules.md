# Optional Modules

All optional modules use a `static register()` pattern that reads environment variables at startup. When the required variables are absent, the module returns an empty `DynamicModule` — no controllers, no providers, no Swagger routes.

## Redis / BullMQ

**Activates when:** `REDIS_URL` is set.

### What it adds

- **`CacheService`** — globally available Redis cache (no-op when inactive)
- **`QueueModule`** — BullMQ queues for background jobs

### CacheService

`CacheService` is `@Global()` and always injectable. When Redis is unavailable, every method is a silent no-op — consumers never need to check `isAvailable`.

```ts
// Get a cached value (returns null on miss or when Redis is down)
const cached = await this.cache.get('my-key');
if (cached) return JSON.parse(cached);

const data = await this.fetchFromDb();
await this.cache.set('my-key', JSON.stringify(data), 300); // 5 min TTL
return data;
```

| Method                        | Description                                                    |
| ----------------------------- | -------------------------------------------------------------- |
| `get(key)`                    | Returns the value or `null`                                    |
| `set(key, value, ttlSeconds)` | Stores with expiry                                             |
| `del(...keys)`                | Deletes one or more keys                                       |
| `invalidatePattern(pattern)`  | Deletes all keys matching a glob pattern — O(N), use sparingly |
| `isAvailable`                 | `true` when Redis is connected and ready                       |

### Adding a queue

1. Define a processor in `src/queue/`:

   ```ts
   // src/queue/email.processor.ts
   @Processor('email')
   export class EmailProcessor extends WorkerHost {
     async process(job: Job<{ to: string; subject: string }>): Promise<void> {
       // send email
     }
   }
   ```

2. Register it in `QueueModule`:

   ```ts
   BullModule.registerQueue({ name: 'email' }),
   ```

3. Inject the queue where you need it:

   ```ts
   @InjectQueue('email') private readonly emailQueue: Queue
   await this.emailQueue.add('send', { to, subject });
   ```

---

## Stripe

**Activates when:** `STRIPE_SECRET_KEY` **and** `STRIPE_WEBHOOK_SECRET` are both set.

### What it adds

- `POST /api/payment/intent` — creates a Stripe `PaymentIntent`
- `POST /api/payment/webhook` — handles Stripe webhook events

### PaymentService

```ts
// Create a payment intent
const { clientSecret } = await this.paymentService.createIntent(
  amount,
  currency,
);
```

### Webhook handling

The webhook endpoint verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`. Extend `PaymentService.handleWebhook()` to handle the events relevant to your domain.

!!! note
The raw request body must be preserved for Stripe signature verification. Armature configures `rawBody: true` in `NestFactory.create()` for this purpose.

---

## Google OAuth

**Activates when:** `GOOGLE_CLIENT_ID` **and** `GOOGLE_CLIENT_SECRET` are both set.

### What it adds

- `GET /api/auth/google` — redirect to Google consent screen
- `GET /api/auth/google/callback` — OAuth callback, issues JWT pair
- `google` entry in `GET /api/auth/methods`

### Flow

1. Client navigates to `GET /api/auth/google`
2. Passport redirects to Google with the configured scopes (`email`, `profile`)
3. Google redirects to `/api/auth/google/callback` with an authorization code
4. `GoogleStrategy.validate()` exchanges the code, normalizes the profile, and calls `SocialAuthService.handleCallback()`
5. `SocialAuthService` upserts the `User` and `OAuthAccount` records
6. `GoogleAuthController` issues a JWT pair and redirects the client to the frontend with tokens

### Extending to other providers

See [Adding a Social Provider](./adding-social-provider.md).
