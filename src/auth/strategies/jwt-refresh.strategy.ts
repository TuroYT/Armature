import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { Env } from '../../config/env.validation.js';
import { ErrorCode } from '../../common/constants/error-constants.js';
import type { JwtPayload } from './jwt.strategy.js';

export interface RefreshTokenUser {
  id: string;
  email: string;
  roles: string[];
  refreshToken: string;
}

const REFRESH_COOKIE_NAME = 'armature_refresh_token';

/**
 * Extracts the refresh token JWT from:
 * 1. `refreshToken` field in the request body (explicit /auth/refresh call)
 * 2. `armature_refresh_token` HttpOnly cookie (set by Google OAuth callback)
 *
 * Body takes precedence so that explicit API clients (mobile, server-to-server)
 * are unaffected by cookie presence.
 */
function extractRefreshToken(req: Request): string | null {
  const body = req.body as Record<string, unknown> | undefined;
  const bodyToken = body?.['refreshToken'];
  if (typeof bodyToken === 'string' && bodyToken.length > 0) return bodyToken;

  const cookies = req.cookies as Record<string, unknown> | undefined;
  const cookieToken = cookies?.[REFRESH_COOKIE_NAME];
  return typeof cookieToken === 'string' && cookieToken.length > 0
    ? cookieToken
    : null;
}

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([extractRefreshToken]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): RefreshTokenUser {
    const refreshToken = extractRefreshToken(req);

    if (!refreshToken) {
      throw new UnauthorizedException(ErrorCode.INVALID_REFRESH_TOKEN);
    }

    return {
      id: payload.sub,
      email: payload.email,
      roles: payload.roles,
      refreshToken,
    };
  }
}
