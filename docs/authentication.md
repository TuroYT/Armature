# Authentication

## Overview

Armature uses **stateless JWT** authentication with secure refresh token rotation.

- **Access token** — short-lived (default `15m`), stateless, validated by the JWT guard on every request
- **Refresh token** — long-lived (default `7d`), hashed with bcrypt and stored in the database; rotated on every use

## Endpoints

| Method | Path                 | Auth          | Description                        |
| ------ | -------------------- | ------------- | ---------------------------------- |
| `POST` | `/api/auth/register` | Public        | Create a new account               |
| `POST` | `/api/auth/login`    | Public        | Login with email + password        |
| `POST` | `/api/auth/refresh`  | Refresh token | Rotate token pair                  |
| `POST` | `/api/auth/logout`   | JWT           | Revoke the current refresh token   |
| `GET`  | `/api/auth/me`       | JWT           | Get the authenticated user profile |
| `GET`  | `/api/auth/methods`  | Public        | List available auth methods        |

### Google OAuth _(when configured)_

| Method | Path                        | Description                       |
| ------ | --------------------------- | --------------------------------- |
| `GET`  | `/api/auth/google`          | Redirect to Google consent screen |
| `GET`  | `/api/auth/google/callback` | OAuth callback — issues JWT pair  |

## Token flow

```
Client                           Server
  │                                │
  │  POST /api/auth/login          │
  │ ─────────────────────────────► │  validates credentials
  │                                │  generates accessToken + refreshToken
  │                                │  stores bcrypt(refreshToken) in DB
  │ ◄───────────────────────────── │
  │  { accessToken, refreshToken } │
  │                                │
  │  GET /api/resource             │
  │  Authorization: Bearer <at>    │
  │ ─────────────────────────────► │  validates JWT signature + expiry
  │ ◄───────────────────────────── │
  │                                │
  │  POST /api/auth/refresh        │  access token expired
  │  Authorization: Bearer <rt>    │
  │ ─────────────────────────────► │  finds matching bcrypt hash in DB
  │                                │  deletes old token (prevents reuse)
  │                                │  issues new token pair
  │ ◄───────────────────────────── │
  │  { accessToken, refreshToken } │
```

## Guards and decorators

### JwtAuthGuard (global)

Applied globally in `AppModule`. Every route requires a valid access token unless explicitly opted out.

```ts
// Skip auth on a route
@Public()
@Get('open-route')
openRoute() { ... }
```

### @CurrentUser()

Extracts the authenticated user from the request. Two types depending on the strategy:

```ts
// In a standard JWT-protected route
@Get('me')
getMe(@CurrentUser() user: AuthUser) {
  // user.id, user.email, user.roles
}

// In the refresh route (jwt-refresh strategy)
@Post('refresh')
refresh(@CurrentUser() user: RefreshTokenUser) {
  // user.id, user.refreshToken (raw token from Authorization header)
}
```

## Multi-device support

Each device holds its own refresh token. Multiple active sessions are supported — a user can be logged in on phone, tablet, and desktop simultaneously. Logging out revokes only the token provided in the request body.

## Social OAuth (Google)

When `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set, the `GoogleAuthModule` registers automatically:

1. `GET /api/auth/google` → redirects to Google
2. Google redirects to `GET /api/auth/google/callback`
3. `GoogleStrategy` normalizes the profile and calls `SocialAuthService.handleCallback()`
4. `SocialAuthService` upserts the user and the `OAuthAccount` record
5. `GoogleAuthController` issues a JWT pair and redirects the client

```ts
// SocialAuthService.handleCallback() — called by every OAuth strategy
async handleCallback(profile: SocialProfile): Promise<User> {
  // upserts user (creates if not exists, updates avatar/name otherwise)
  // upserts OAuthAccount (links provider to user)
  return user;
}
```

Users created via OAuth have `passwordHash = null`. They cannot log in with email + password unless a password is set separately.

## Auth methods endpoint

`GET /api/auth/methods` returns the list of available authentication methods at runtime:

```json
{
  "methods": [
    { "id": "password", "label": "Email & Password", "enabled": true },
    { "id": "google", "label": "Google", "enabled": true }
  ]
}
```

The list is built automatically from all registered `SocialProvider` implementations. See [Adding a Social Provider](./adding-social-provider.md) for details.
