import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.validation.js';
import { ErrorCode } from '../../common/constants/error-constants.js';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[]; // role names, e.g. ["admin", "moderator"]
}

export interface AuthUser {
  id: string;
  email: string;
  roles: string[];
}

/**
 * JWT access token strategy.
 * Reads the Bearer token from the Authorization header and validates the payload.
 * Attaches the decoded user to req.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload.sub) {
      throw new UnauthorizedException(ErrorCode.INVALID_TOKEN);
    }
    return { id: payload.sub, email: payload.email, roles: payload.roles };
  }
}
