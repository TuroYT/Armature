# Adding a Social Provider

Armature is designed so that adding a new OAuth provider (GitHub, Apple, Discord…) requires touching **only the new provider's files**. No changes to `AuthService`, `AuthController`, or `AppModule` are needed.

## How it works

Each provider module:

1. Creates a **Passport strategy** that normalizes the OAuth profile
2. Calls the shared `SocialAuthService.handleCallback()` for user upsert
3. Registers a `SocialProvider` implementation via the `SOCIAL_PROVIDER` multi-token
4. Self-activates via `static register()` when its env vars are present

`AuthService` collects all registered `SocialProvider` instances via `@Optional() @Inject(SOCIAL_PROVIDER)` and exposes them through `GET /api/auth/methods` automatically.

## Step-by-step: adding GitHub

### 1. Install the Passport strategy

```bash
npm install passport-github2
npm install --save-dev @types/passport-github2
```

### 2. Add env vars to the Zod schema

```ts
// src/config/env.validation.ts
GITHUB_CLIENT_ID: z.string().optional(),
GITHUB_CLIENT_SECRET: z.string().optional(),
```

### 3. Create the SocialProvider implementation

```ts
// src/auth/social/github-social.provider.ts
import { Injectable } from '@nestjs/common';
import { SocialProvider } from './social-provider.port.js';

@Injectable()
export class GithubSocialProvider extends SocialProvider {
  readonly id = 'github';
  readonly label = 'GitHub';
  readonly enabled =
    !!process.env['GITHUB_CLIENT_ID'] && !!process.env['GITHUB_CLIENT_SECRET'];
}
```

### 4. Create the Passport strategy

```ts
// src/auth/social/github.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile } from 'passport-github2';
import { SocialAuthService } from './social-auth.service.js';
import type { Env } from '../../config/env.validation.js';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(
    config: ConfigService<Env, true>,
    private readonly socialAuth: SocialAuthService,
  ) {
    super({
      clientID: config.get('GITHUB_CLIENT_ID', { infer: true }),
      clientSecret: config.get('GITHUB_CLIENT_SECRET', { infer: true }),
      callbackURL: '/api/auth/github/callback',
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (err: Error | null, user?: unknown) => void,
  ): Promise<void> {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('No email returned from GitHub'));

    const user = await this.socialAuth.handleCallback({
      provider: 'github',
      providerAccountId: profile.id,
      email,
      firstName: profile.displayName?.split(' ')[0] ?? null,
      lastName: profile.displayName?.split(' ').slice(1).join(' ') || null,
      avatarUrl: profile.photos?.[0]?.value ?? null,
      accessToken,
      refreshToken,
    });

    done(null, user);
  }
}
```

### 5. Create the controller

```ts
// src/auth/social/github-auth.controller.ts
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth.service.js';
import { Public } from '../decorators/public.decorator.js';
import type { AuthUser } from '../strategies/jwt.strategy.js';

@ApiExcludeController()
@Controller('api/auth/github')
export class GithubAuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @UseGuards(AuthGuard('github'))
  @Get()
  initiate(): void {
    /* Passport handles the redirect */
  }

  @Public()
  @UseGuards(AuthGuard('github'))
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const user = req.user as AuthUser;
    const tokens = await this.authService.issueTokensForUser(
      user.id,
      user.email,
    );
    res.redirect(
      `/auth/callback?accessToken=${tokens.accessToken}&refreshToken=${tokens.refreshToken}`,
    );
  }
}
```

### 6. Create the dynamic module

```ts
// src/auth/social/github-auth.module.ts
import { DynamicModule, Logger, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { GithubStrategy } from './github.strategy.js';
import { GithubAuthController } from './github-auth.controller.js';
import { SocialAuthService } from './social-auth.service.js';
import { GithubSocialProvider } from './github-social.provider.js';
import { SOCIAL_PROVIDER } from './social-provider.port.js';

@Module({})
export class GithubAuthModule {
  static register(): DynamicModule {
    const isActive =
      !!process.env['GITHUB_CLIENT_ID'] &&
      !!process.env['GITHUB_CLIENT_SECRET'];

    if (!isActive) {
      new Logger('GithubAuthModule').warn(
        'GitHub OAuth not configured — module disabled',
      );
      return { module: GithubAuthModule };
    }

    return {
      module: GithubAuthModule,
      imports: [PassportModule.register({ defaultStrategy: 'github' })],
      controllers: [GithubAuthController],
      providers: [
        SocialAuthService,
        GithubStrategy,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {
          provide: SOCIAL_PROVIDER,
          useValue: new GithubSocialProvider(),
          multi: true,
        } as any,
      ],
    };
  }
}
```

### 7. Register in AppModule

```ts
// src/app.module.ts
imports: [
  // ... existing modules
  GithubAuthModule.register(),
],
```

That's it. The GitHub routes appear in Swagger when the module is active, and `GET /api/auth/methods` includes `{ id: 'github', label: 'GitHub', enabled: true }` automatically.
