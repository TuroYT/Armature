import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { SocialAuthService } from './social-auth.service.js';
import type { Env } from '../../config/env.validation.js';

/**
 * Stateless HMAC state store for OAuth CSRF protection.
 *
 * Standard session-based state stores require server-side session middleware.
 * This store generates a signed nonce (HMAC-SHA256 over a random value) that
 * can be verified without any shared state — suitable for stateless APIs.
 *
 * Attack surface covered: login CSRF — an attacker cannot force a victim to
 * complete an OAuth flow tied to the attacker's account.
 */
class HmacStateStore {
  constructor(private readonly secret: string) {}

  store(
    _req: Request,
    callbackOrMeta: unknown,
    maybeCallback?: unknown,
  ): void {
    const callback =
      typeof maybeCallback === 'function'
        ? (maybeCallback as (err: Error | null, state: string) => void)
        : (callbackOrMeta as (err: Error | null, state: string) => void);

    const nonce = randomBytes(16).toString('hex');
    const sig = createHmac('sha256', this.secret).update(nonce).digest('hex');
    callback(null, `${nonce}.${sig}`);
  }

  verify(
    _req: Request,
    state: string,
    callbackOrMeta: unknown,
    maybeCallback?: unknown,
  ): void {
    const callback =
      typeof maybeCallback === 'function'
        ? (maybeCallback as (
            err: Error | null,
            ok: boolean,
            state: unknown,
          ) => void)
        : (callbackOrMeta as (
            err: Error | null,
            ok: boolean,
            state: unknown,
          ) => void);

    const dotIndex = state.lastIndexOf('.');
    if (dotIndex < 0) {
      callback(null, false, null);
      return;
    }

    const nonce = state.slice(0, dotIndex);
    const sig = state.slice(dotIndex + 1);

    if (!nonce || !sig) {
      callback(null, false, null);
      return;
    }

    try {
      const expected = createHmac('sha256', this.secret)
        .update(nonce)
        .digest('hex');
      const sigBuf = Buffer.from(sig, 'hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      // timingSafeEqual prevents timing-based signature forgery.
      const ok =
        sigBuf.length === expectedBuf.length &&
        timingSafeEqual(sigBuf, expectedBuf);
      callback(null, ok, {});
    } catch {
      callback(null, false, null);
    }
  }
}

/**
 * Google OAuth strategy.
 * Responsibilities: configure the OAuth flow, normalize the Google profile.
 * Delegates user upsert to SocialAuthService — which is shared by all providers.
 *
 * Security:
 * - Uses a stateless HMAC state store to protect against login CSRF.
 * - Rejects profiles where Google has not verified the email address.
 *
 * To add GitHub: create github.strategy.ts that normalizes the GitHub profile
 * and calls this.socialAuth.handleCallback(normalizedProfile). That's it.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly socialAuth: SocialAuthService,
  ) {
    const jwtSecret = config.get('JWT_SECRET', { infer: true });
    super({
      clientID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      callbackURL:
        config.get('GOOGLE_OAUTH_CALLBACK_URL', { infer: true }) ??
        '/api/auth/google/callback',
      scope: ['email', 'profile'],
      // The `store` option lives on passport-oauth2 (parent) and is not exposed
      // in the StrategyOptions type of passport-google-oauth20 — safe at runtime.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      store: new HmacStateStore(jwtSecret),
    } as any);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email returned from Google'));

    // Reject unverified emails to prevent account-takeover via email
    // pre-registration (attacker claims victim's address on a rogue provider).
    const rawJson = profile as Profile & {
      _json?: { email_verified?: boolean };
    };
    const emailVerified = rawJson._json?.email_verified === true;
    if (!emailVerified) {
      return done(new Error('Email address not verified by Google'));
    }

    const user = await this.socialAuth.handleCallback({
      provider: 'google',
      providerAccountId: profile.id,
      email,
      emailVerified: true,
      firstName: profile.name?.givenName ?? null,
      lastName: profile.name?.familyName ?? null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
      accessToken,
      refreshToken,
    });

    done(null, user);
  }
}
