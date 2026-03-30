import { DynamicModule, Logger, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategy } from './google.strategy.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { SocialAuthService } from './social-auth.service.js';
import { GoogleSocialProvider } from './google-social.provider.js';
import { SOCIAL_PROVIDER } from './social-provider.port.js';

@Module({})
export class GoogleAuthModule {
  /**
   * Self-activating dynamic module.
   * Active when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are both set.
   * Swagger documents the Google OAuth routes only when active.
   *
   * To add a new provider (GitHub, Apple…):
   * 1. Create github.strategy.ts — normalize profile → call SocialAuthService.handleCallback()
   * 2. Create GithubAuthModule following this same pattern.
   * SocialAuthService handles user upsert for all providers.
   */
  static register(): DynamicModule {
    const isActive =
      !!process.env['GOOGLE_CLIENT_ID'] &&
      !!process.env['GOOGLE_CLIENT_SECRET'];

    if (!isActive) {
      new Logger('GoogleAuthModule').warn(
        'Google OAuth not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing) — module disabled',
      );
      return { module: GoogleAuthModule };
    }

    return {
      module: GoogleAuthModule,
      imports: [PassportModule.register({ defaultStrategy: 'google' })],
      controllers: [GoogleAuthController],
      providers: [
        SocialAuthService,
        GoogleStrategy,
        // Registers this provider in the global SOCIAL_PROVIDER multi-token
        // so AuthService can expose it via GET /api/auth/methods.

        {
          provide: SOCIAL_PROVIDER,
          useValue: new GoogleSocialProvider(),
          multi: true,
        } as any,
      ],
    };
  }
}
