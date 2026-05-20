import { jest, describe, it, expect, afterEach } from '@jest/globals';
import { HttpClient } from '../src/http.js';
import { ArmatureError } from '../src/errors.js';

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

describe('HttpClient', () => {
  it('adds Authorization header when token is set', async () => {
    const http = new HttpClient({ baseUrl: 'http://localhost:3000' });
    http.setTokens({ accessToken: 'tok', refreshToken: 'ref' });

    mockFetch.mockResolvedValueOnce(jsonResponse({ id: '1' }));
    await http.get('/test');

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer tok');
  });

  it('throws ArmatureError on 404', async () => {
    const http = new HttpClient({ baseUrl: 'http://localhost:3000' });
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: 'Not found', error: 'NOT_FOUND' }, 404),
    );

    await expect(http.get('/missing')).rejects.toThrow(ArmatureError);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: 'Not found', error: 'NOT_FOUND' }, 404),
    );
    await expect(http.get('/missing')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('auto-refreshes on 401 and retries the request', async () => {
    const onTokensRefreshed = jest.fn();
    const http = new HttpClient({
      baseUrl: 'http://localhost:3000',
      onTokensRefreshed,
    });
    http.setTokens({ accessToken: 'expired', refreshToken: 'ref' });

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized', error: 'UNAUTHORIZED' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'new-acc', refreshToken: 'new-ref' }))
      .mockResolvedValueOnce(jsonResponse({ id: '1' }));

    const result = await http.get<{ id: string }>('/api/resources/1');

    expect(result.id).toBe('1');
    expect(onTokensRefreshed).toHaveBeenCalledWith({
      accessToken: 'new-acc',
      refreshToken: 'new-ref',
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('throws ArmatureError if refresh fails', async () => {
    const http = new HttpClient({ baseUrl: 'http://localhost:3000' });
    http.setTokens({ accessToken: 'expired', refreshToken: 'bad-ref' });

    mockFetch
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));

    await expect(http.get('/api/auth/me')).rejects.toMatchObject({ status: 401 });
  });

  it('does not retry if no refreshToken', async () => {
    const http = new HttpClient({ baseUrl: 'http://localhost:3000' });

    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, 401));

    await expect(http.get('/api/auth/me')).rejects.toMatchObject({ status: 401 });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
