import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { LoggerService } from '../../common/logger/logger.service.js';
import { ErrorCode } from '../../common/constants/error-constants.js';
import type { SocialProfile } from './social-auth.port.js';

export interface SocialAuthResult {
  id: string;
  email: string;
}

/**
 * Handles the common logic for all social OAuth providers.
 *
 * Each Passport strategy normalizes its raw profile into a {@link SocialProfile}
 * and calls {@link handleCallback} — no other code change is needed to add
 * a new provider (GitHub, Apple, X, etc.).
 *
 * Behavior:
 * - If the email is already known → link the provider account to the existing user.
 * - If the email is new → create the user, then link the provider account.
 * - If the provider account already exists → update tokens.
 *
 * Security invariant: `profile.emailVerified` must be `true` before this method is
 * called. Strategies are responsible for verifying this before calling handleCallback.
 * Linking an unverified email to an existing account enables account-takeover via
 * email pre-registration on a rogue provider.
 */
@Injectable()
export class SocialAuthService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    logger: LoggerService,
  ) {
    this.logger = logger.withContext('SocialAuthService');
  }

  async handleCallback(profile: SocialProfile): Promise<SocialAuthResult> {
    if (!profile.emailVerified) {
      throw new UnauthorizedException(ErrorCode.EMAIL_NOT_VERIFIED);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
      select: { id: true, passwordHash: true },
    });

    // Log when a social provider is being linked to an existing password-based
    // account. This is a legitimate use case (user adding a second login method)
    // but worth auditing in case of unexpected linking activity.
    if (existingUser?.passwordHash) {
      this.logger.log('Social provider linked to existing password account', {
        provider: profile.provider,
        userId: existingUser.id,
      });
    }

    // Upsert user by email — link provider if account already exists
    const user = await this.prisma.user.upsert({
      where: { email: profile.email },
      update: {
        ...(profile.avatarUrl && { avatarUrl: profile.avatarUrl }),
      },
      create: {
        email: profile.email,
        firstName: profile.firstName ?? null,
        lastName: profile.lastName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
      },
    });

    // Upsert the OAuth account link
    await this.prisma.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      update: {
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
      },
      create: {
        userId: user.id,
        provider: profile.provider,
        providerAccountId: profile.providerAccountId,
        accessToken: profile.accessToken,
        refreshToken: profile.refreshToken,
      },
    });

    this.logger.log('Social login', {
      provider: profile.provider,
      userId: user.id,
    });

    return { id: user.id, email: user.email };
  }
}
