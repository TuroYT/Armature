/**
 * Abstract port for social authentication providers.
 *
 * Each provider module registers one implementation via:
 * ```ts
 * { provide: SOCIAL_PROVIDER, useClass: GoogleSocialProvider, multi: true }
 * ```
 *
 * AuthService collects all registered providers via @Inject(SOCIAL_PROVIDER)
 * and exposes them through GET /api/auth/methods — no code change needed
 * when adding or removing a provider.
 */
export abstract class SocialProvider {
  /** Machine-readable identifier — e.g. "google", "github". */
  abstract readonly id: string;

  /** Human-readable label shown to the client — e.g. "Google", "GitHub". */
  abstract readonly label: string;

  /** True when the provider is properly configured and active. */
  abstract readonly enabled: boolean;
}

/** Multi-injection token for social providers. */
export const SOCIAL_PROVIDER = Symbol('SOCIAL_PROVIDER');
