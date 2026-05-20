// AUTO-GENERATED — do not edit. Run `npm run generate` to update.

import type { HttpClient } from '../../http.js';
import { AuthOAuthMixin } from '../../modules/auth-oauth.js';
import type {
  AuthResponseDto,
  TokensDto,
  UserDto,
  AuthMethodDto,
  LoginInput,
  RegisterInput,
} from '../schema.js';

export class AuthModule extends AuthOAuthMixin {
  constructor(http: HttpClient, baseUrl: string) {
    super(http, baseUrl);
  }

  async login(body: LoginInput): Promise<AuthResponseDto> {
    const result = await this.http.post<AuthResponseDto>('/api/auth/login', body, true);
    this.http.setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    return result;
  }

  async register(body: RegisterInput): Promise<AuthResponseDto> {
    const result = await this.http.post<AuthResponseDto>('/api/auth/register', body, true);
    this.http.setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    return result;
  }

  refresh(): Promise<TokensDto> {
    return this.http.post<TokensDto>(
      '/api/auth/refresh',
      { refreshToken: this.http.getTokens().refreshToken },
      true,
    );
  }

  async logout(): Promise<void> {
    const { refreshToken } = this.http.getTokens();
    await this.http.post<void>('/api/auth/logout', { refreshToken });
    this.http.clearTokens();
  }

  me(): Promise<UserDto> {
    return this.http.get<UserDto>('/api/auth/me');
  }

  async methods(): Promise<AuthMethodDto[]> {
    const result = await this.http.get<{ methods: AuthMethodDto[] }>('/api/auth/methods');
    return result.methods;
  }
}
