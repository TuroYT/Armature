import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
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

const RESOURCE = {
  id: 'r1',
  name: 'Test',
  description: null,
  ownerId: 'u1',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('ResourcesModule', () => {
  let client: ArmatureClient;

  beforeEach(() => {
    client = new ArmatureClient({ baseUrl: 'http://localhost:3000' });
    client.setTokens({ accessToken: 'tok', refreshToken: 'ref' });
  });

  it('list calls GET /api/resources', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [RESOURCE], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }),
    );

    const result = await client.resources.list();

    expect(result.data).toHaveLength(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:3000/api/resources');
  });

  it('list appends query params', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ data: [], meta: { page: 2, limit: 10, total: 0, totalPages: 0 } }),
    );

    await client.resources.list({ page: 2, limit: 10, q: 'hello' });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain('page=2');
    expect(url).toContain('limit=10');
    expect(url).toContain('q=hello');
  });

  it('create sends POST with body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(RESOURCE, 201));

    await client.resources.create({ name: 'Test', description: 'desc' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Test', description: 'desc' });
  });

  it('update sends PATCH with body', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ ...RESOURCE, name: 'Updated' }));

    await client.resources.update('r1', { name: 'Updated' });

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/resources/r1');
    expect(init.method).toBe('PATCH');
  });

  it('delete sends DELETE and returns void', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      text: () => Promise.resolve(''),
    } as Response);

    const result = await client.resources.delete('r1');

    expect(result).toBeUndefined();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/api/resources/r1');
    expect(init.method).toBe('DELETE');
  });
});
