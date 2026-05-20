import type { HttpClient } from '../http.js';

export class AuthOAuthMixin {
  constructor(
    protected readonly http: HttpClient,
    protected readonly baseUrl: string,
  ) {}

  socialRedirect(provider: string): void {
    if (typeof window === 'undefined') {
      throw new Error('socialRedirect() is only available in browser environments');
    }
    window.location.href = `${this.baseUrl}/api/auth/${provider}`;
  }

  handleOAuthCallback(url?: string): string | null {
    const searchString =
      url
        ? new URL(url).search
        : typeof window !== 'undefined'
          ? window.location.search
          : '';

    const params = new URLSearchParams(searchString);
    const accessToken = params.get('accessToken');

    if (accessToken) {
      const tokens = { accessToken };
      this.http.setTokens(tokens);
    }

    return accessToken;
  }
}
