import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';
import { SocialAuthService } from './social-auth.service.js';
import type { Env } from '../../config/env.validation.js';

/**
 * Google OAuth strategy.
 * Responsibilities: configure the OAuth flow, normalize the Google profile.
 * Delegates user upsert to SocialAuthService — which is shared by all providers.
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
    super({
      clientID: config.get('GOOGLE_CLIENT_ID', { infer: true }),
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      callbackURL:
        config.get('GOOGLE_OAUTH_CALLBACK_URL', { infer: true }) ??
        '/api/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email returned from Google'));

    const user = await this.socialAuth.handleCallback({
      provider: 'google',
      providerAccountId: profile.id,
      email,
      firstName: profile.name?.givenName ?? null,
      lastName: profile.name?.familyName ?? null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
      accessToken,
      refreshToken,
    });

    done(null, user);
  }
}
