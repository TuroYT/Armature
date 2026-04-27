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
      'Sets refresh token in an HttpOnly cookie and redirects to the frontend',
  })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const googleUser = req.user as { id: string; email: string };

    const user = await this.authService.getMe(googleUser.id);
    const tokens = await this.authService.issueTokensForUser(
      googleUser.id,
      googleUser.email,
    );

    const frontendUrl =
      this.config.get('CORS_ORIGIN', { infer: true }) ??
      'http://localhost:3000';
    const isProduction =
      this.config.get('NODE_ENV', { infer: true }) === 'production';

    // The refresh token is sensitive — never expose it via URL (browser
    // history, referrers, server logs). It travels in an HttpOnly cookie
    // scoped to the API and the frontend reads it back via /auth/refresh.
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
    });

    const redirect = new URL('/auth/callback', frontendUrl);
    redirect.searchParams.set('accessToken', tokens.accessToken);
    redirect.searchParams.set('userId', user.id);

    res.redirect(redirect.toString());
  }
}
