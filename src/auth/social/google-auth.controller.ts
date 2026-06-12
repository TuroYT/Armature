import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '../decorators/public.decorator.js';
import { AuthService } from '../auth.service.js';
import type { Env } from '../../config/env.validation.js';

const REFRESH_COOKIE_NAME = 'armature_refresh_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@ApiTags('Auth — Google OAuth')
@Controller('api/auth/google')
export class GoogleAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  @Get()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirect to Google OAuth consent screen' })
  @ApiResponse({ status: 302, description: 'Redirects to Google' })
  googleLogin(): void {}

  @Public()
  @Get('callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({
    summary: 'Google OAuth callback — exchanges code for JWT tokens',
  })
  @ApiResponse({
    status: 302,
    description:
      'Sets both tokens in HttpOnly cookies and redirects to the frontend',
  })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const googleUser = req.user as { id: string; email: string };

    const tokens = await this.authService.issueTokensForUser(
      googleUser.id,
      googleUser.email,
    );

    const frontendUrl =
      this.config.get('CORS_ORIGIN', { infer: true }) ??
      'http://localhost:3000';
    const isProduction =
      this.config.get('NODE_ENV', { infer: true }) === 'production';

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax' as const,
      path: '/api/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    };

    // Both tokens travel as HttpOnly cookies — neither ever appears in a URL,
    // browser history, Referer header, or server log.
    // The access token cookie is readable only via /api/* requests (path scope).
    // The refresh token is scoped to /api/auth to limit its exposure surface.
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, cookieOptions);
    res.cookie('armature_access_token', tokens.accessToken, {
      ...cookieOptions,
      // Access token is short-lived — align cookie expiry with JWT expiry (15 min default).
      maxAge: 15 * 60 * 1000,
      path: '/api',
    });

    // Redirect to the frontend callback route. No tokens in the URL.
    const redirect = new URL('/auth/callback', frontendUrl);
    res.redirect(redirect.toString());
  }
}
