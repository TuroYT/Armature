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

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_REFRESH_SECRET', { infer: true }),
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: JwtPayload): RefreshTokenUser {
    const body = req.body as Record<string, unknown>;
    const refreshToken = body['refreshToken'];

    if (!refreshToken || typeof refreshToken !== 'string') {
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
