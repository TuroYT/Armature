import {
  ConflictException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoggerService } from '../common/logger/logger.service.js';
import { ErrorCode } from '../common/constants/error-constants.js';
import { serialize } from '../common/utils/serialize.js';
import type { Env } from '../config/env.validation.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import {
  type AuthResponseDto,
  type TokensResponseDto,
  type UserResponseDto,
  UserResponseDto as UserResponseDtoClass,
} from './dto/auth-response.dto.js';
import type { JwtPayload } from './strategies/jwt.strategy.js';
import {
  type SocialProvider,
  SOCIAL_PROVIDER,
} from './social/social-provider.port.js';

/** User with their roles eagerly loaded — used internally after DB queries. */
type UserWithRoles = Awaited<ReturnType<AuthService['findUserWithRoles']>>;

@Injectable()
export class AuthService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
    logger: LoggerService,
    @Optional()
    @Inject(SOCIAL_PROVIDER)
    private readonly socialProviders: SocialProvider[] = [],
  ) {
    this.logger = logger.withContext('AuthService');
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException(ErrorCode.USER_ALREADY_EXISTS);

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Assign the default "user" role on creation
    const defaultRole = await this.prisma.role.findUnique({
      where: { name: 'user' },
    });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName ?? null,
        lastName: dto.lastName ?? null,
        ...(defaultRole && {
          userRoles: { create: { roleId: defaultRole.id } },
        }),
      },
      include: { userRoles: { include: { role: true } } },
    });

    this.logger.log('User registered', { userId: user.id });

    const roleNames = user.userRoles.map((ur) => ur.role.name);
    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      roleNames,
    );
    return { ...tokens, user: this.toUserResponse(user) };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.findUserWithRoles(dto.email);

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS);
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException(ErrorCode.INVALID_CREDENTIALS);
    }

    this.logger.log('User logged in', { userId: user.id });

    // Purge expired tokens on login to keep the table size bounded.
    await this.pruneExpiredTokens(user.id);

    const roleNames = user.userRoles.map((ur) => ur.role.name);
    const tokens = await this.generateAndStoreTokens(
      user.id,
      user.email,
      roleNames,
    );
    return { ...tokens, user: this.toUserResponse(user) };
  }

  async refresh(
    userId: string,
    incomingToken: string,
  ): Promise<TokensResponseDto> {
    // Load ALL tokens for the user, including already-used ones.
    // Used tokens are retained briefly to detect replay attacks (reuse detection).
    const allTokens = await this.prisma.refreshToken.findMany({
      where: { userId },
    });

    let matchedToken: (typeof allTokens)[0] | null = null;
    for (const stored of allTokens) {
      if (await bcrypt.compare(incomingToken, stored.tokenHash)) {
        matchedToken = stored;
        break;
      }
    }

    if (!matchedToken) {
      throw new UnauthorizedException(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    // Reuse detected: this token was already rotated.
    // Revoke the entire token family — the legitimate holder's current token is
    // also invalidated, forcing re-authentication. This limits the damage window
    // when a refresh token has been stolen and replayed.
    if (matchedToken.used) {
      await this.prisma.refreshToken.deleteMany({
        where: { userId, family: matchedToken.family },
      });
      this.logger.warn('Refresh token reuse detected — family revoked', {
        userId,
        family: matchedToken.family,
      });
      throw new UnauthorizedException(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    if (matchedToken.expiresAt <= new Date()) {
      throw new UnauthorizedException(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    // Mark as used instead of deleting — keeps the record alive for the reuse
    // detection window (until its natural expiry).
    await this.prisma.refreshToken.update({
      where: { id: matchedToken.id },
      data: { used: true },
    });

    // Purge fully expired tokens for this user (housekeeping).
    await this.pruneExpiredTokens(userId);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });

    const roleNames = user.userRoles.map((ur) => ur.role.name);
    // Inherit the token family so reuse detection spans the full rotation chain.
    return this.generateAndStoreTokens(
      user.id,
      user.email,
      roleNames,
      matchedToken.family,
    );
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const storedTokens = await this.prisma.refreshToken.findMany({
      where: { userId },
    });

    for (const stored of storedTokens) {
      if (await bcrypt.compare(refreshToken, stored.tokenHash)) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
        break;
      }
    }

    // Purge expired tokens while we're here.
    await this.pruneExpiredTokens(userId);
  }

  /**
   * Returns available authentication methods.
   *
   * Password is always included. Social providers are collected from all
   * modules that register a { provide: SOCIAL_PROVIDER, multi: true } provider.
   * Adding a new provider never requires touching this method.
   */
  getAvailableMethods(): { id: string; label: string; enabled: boolean }[] {
    const password = {
      id: 'password',
      label: 'Email & Password',
      enabled: true,
    };

    const social = (this.socialProviders ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      enabled: p.enabled,
    }));

    return [password, ...social];
  }

  /** Used by Google OAuth callback to issue tokens for an already-resolved user. */
  async issueTokensForUser(
    userId: string,
    email: string,
  ): Promise<TokensResponseDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    const roleNames = user.userRoles.map((ur) => ur.role.name);
    return this.generateAndStoreTokens(userId, email, roleNames);
  }

  async getMe(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) throw new UnauthorizedException(ErrorCode.USER_NOT_FOUND);
    return this.toUserResponse(user);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private findUserWithRoles(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });
  }

  private toUserResponse(user: UserWithRoles): UserResponseDto {
    return serialize(UserResponseDtoClass, {
      ...user,
      roles: user?.userRoles.map((ur) => ur.role) ?? [],
    });
  }

  /** Delete all expired tokens for a user. Called lazily on login/refresh/logout. */
  private pruneExpiredTokens(userId: string): Promise<{ count: number }> {
    return this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }

  private async generateAndStoreTokens(
    userId: string,
    email: string,
    roles: string[],
    /** Rotation chain identifier. Omit to start a new chain (first login). */
    family?: string,
  ): Promise<TokensResponseDto> {
    const payload: JwtPayload = { sub: userId, email, roles };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_EXPIRES_IN', { infer: true }),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', { infer: true }),
      }),
    ]);

    const tokenHash = await bcrypt.hash(refreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // New family on first issue; inherited family on rotation.
    const tokenFamily = family ?? randomUUID();

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt, family: tokenFamily },
    });

    return { accessToken, refreshToken };
  }
}
