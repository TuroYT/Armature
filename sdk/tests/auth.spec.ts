import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { ArmatureClient } from '../src/client.js';

const mockFetch = jest.fn();
globalThis.fetch = mockFetch as typeof fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as Response;
}

afterEach(() => mockFetch.mockReset());

const AUTH_RESPONSE = {
  accessToken: 'access-123',
  refreshToken: 'refresh-456',
  user: {
    id: 'u1',
    email: 'a@b.com',
    firstName: null,
    lastName: null,
    avatarUrl: null,
    roles: [],
    createdAt: new Date().toISOString(),
  },
};

describe('AuthModule', () => {
  it('login stores tokens in client', async () => {
    const client = new ArmatureClient({ baseUrl: 'http://localhost:3000' });
    mockFetch.mockResolvedValueOnce(jsonResponse(AUTH_RESPONSE));

    await client.auth.login({ email: 'a@b.com', password: 'password123' });

    expect(client.getTokens()).toEqual({
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
    });
  });

  it('register stores tokens in client', async () => {
    const client = new ArmatureClient({ baseUrl: 'http://localhost:3000' });
    mockFetch.mockResolvedValueOnce(jsonResponse(AUTH_RESPONSE));

    await client.auth.register({ email: 'a@b.com', password: 'password123' });

    expect(client.getTokens().accessToken).toBe('access-123');
  });

  it('logout clears tokens', async () => {
    const client = new ArmatureClient({ baseUrl: 'http://localhost:3000' });
    client.setTokens({ accessToken: 'acc', refreshToken: 'ref' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    } as Response);

    await client.auth.logout();

    expect(client.getTokens()).toEqual({ accessToken: null, refreshToken: null });
  });

  it('handleOAuthCallback extracts token from URL string', () => {
    const client = new ArmatureClient({ baseUrl: 'http://localhost:3000' });

    const token = client.auth.handleOAuthCallback(
      'http://app.com/callback?accessToken=oauth-tok&userId=u1',
    );

    expect(token).toBe('oauth-tok');
    expect(client.getTokens().accessToken).toBe('oauth-tok');
  });

  it('handleOAuthCallback returns null if no token in URL', () => {
    const client = new ArmatureClient({ baseUrl: 'http://localhost:3000' });

    const token = client.auth.handleOAuthCallback('http://app.com/callback');

    expect(token).toBeNull();
  });
});
