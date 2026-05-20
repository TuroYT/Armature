import { ArmatureError } from './errors.js';
import type { TokensDto, ArmatureClientConfig } from './types.js';

export class HttpClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private refreshPromise: Promise<TokensDto> | null = null;

  constructor(private readonly config: ArmatureClientConfig) {}

  setTokens(tokens: TokensDto): void {
    this.accessToken = tokens.accessToken;
    this.refreshToken = tokens.refreshToken ?? null;
  }

  getTokens(): { accessToken: string | null; refreshToken: string | null } {
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }

  clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    skipAuth = false,
  ): Promise<T> {
    const response = await this.doRequest(method, path, body, skipAuth);

    if (response.status === 401 && !skipAuth && this.refreshToken) {
      await this.doRefresh();
      const retried = await this.doRequest(method, path, body, skipAuth);
      return this.parseResponse<T>(retried);
    }

    return this.parseResponse<T>(response);
  }

  private async doRequest(
    method: string,
    path: string,
    body?: unknown,
    skipAuth = false,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (!skipAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    return fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async doRefresh(): Promise<void> {
    if (this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    this.refreshPromise = this.performRefresh();
    try {
      const tokens = await this.refreshPromise;
      this.setTokens(tokens);
      this.config.onTokensRefreshed?.(tokens);
    } finally {
      this.refreshPromise = null;
    }
  }

  private async performRefresh(): Promise<TokensDto> {
    const res = await fetch(`${this.config.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: this.refreshToken }),
    });

    if (!res.ok) {
      this.clearTokens();
      throw new ArmatureError('Session expired', 401, 'UNAUTHORIZED');
    }

    const text = await res.text();
    return JSON.parse(text) as TokensDto;
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();

    if (!text) return undefined as T;

    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!response.ok) {
      const code =
        typeof data === 'object' && data !== null && 'error' in data
          ? String((data as Record<string, unknown>)['error'])
          : 'UNKNOWN_ERROR';
      const message =
        typeof data === 'object' && data !== null && 'message' in data
          ? String((data as Record<string, unknown>)['message'])
          : text;
      throw new ArmatureError(message, response.status, code);
    }

    return data as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown, skipAuth = false): Promise<T> {
    return this.request<T>('POST', path, body, skipAuth);
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
