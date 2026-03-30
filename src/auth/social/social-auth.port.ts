/**
 * Normalized profile shape — every social provider adapter must map
 * its raw profile to this structure before calling SocialAuthService.
 *
 * Adding a new provider (GitHub, Apple, etc.) = create a new Passport strategy
 * that normalizes to SocialProfile and injects SocialAuthService.
 * No other code changes required.
 */
export interface SocialProfile {
  /** Provider-side user ID */
  providerAccountId: string;
  /** OAuth provider slug: "google" | "github" | "apple" | ... */
  provider: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  accessToken?: string;
  refreshToken?: string;
}
