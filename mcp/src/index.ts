#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

const SESSION_FILE = join(process.cwd(), '.claude', '.armature-session.json');

interface Session {
  accessToken: string;
  refreshToken: string;
}

function loadSession(): Session | null {
  try {
    if (existsSync(SESSION_FILE)) {
      return JSON.parse(readFileSync(SESSION_FILE, 'utf-8')) as Session;
    }
  } catch { /* ignore corrupt file */ }
  return null;
}

function saveSession(session: Session): void {
  writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
}

function clearSession(): void {
  try { unlinkSync(SESSION_FILE); } catch { /* ignore */ }
}

// Startup: env var takes priority, then persisted session
const stored = loadSession();
const BASE_URL = process.env['ARMATURE_BASE_URL'] ?? 'http://localhost:3000';
let accessToken: string | null = process.env['ARMATURE_TOKEN'] ?? stored?.accessToken ?? null;
let refreshToken: string | null = stored?.refreshToken ?? null;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

/**
 * @param authToken  Pass a token string to use it as Bearer.
 *                   Pass null to send no Authorization header (public routes).
 *                   Omit to use the current accessToken.
 */
async function apiCall<T>(
  method: string,
  path: string,
  body?: unknown,
  authToken?: string | null,
): Promise<T> {
  const token = authToken === undefined ? accessToken : authToken;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? (data as { message: string }).message
        : text;
    throw new Error(`HTTP ${res.status}: ${message}`);
  }

  return data as T;
}

type AuthResponse = { accessToken: string; refreshToken: string; user: unknown };
type TokensResponse = { accessToken: string; refreshToken: string };

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    name: 'auth_methods',
    description: 'List available authentication methods (password, Google OAuth…).',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'auth_register',
    description:
      'Register a new user account. Persists the access + refresh tokens to ' +
      '.claude/.armature-session.json for use across MCP restarts.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'User email address' },
        password: { type: 'string', description: 'Password (min 8 chars)' },
        firstName: { type: 'string', description: 'First name (optional)' },
        lastName: { type: 'string', description: 'Last name (optional)' },
      },
      required: ['email', 'password'],
    },
  },
  {
    name: 'auth_login',
    description:
      'Log in with email and password. Persists the access + refresh tokens to ' +
      '.claude/.armature-session.json for use across MCP restarts.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string' },
        password: { type: 'string' },
      },
      required: ['email', 'password'],
    },
  },
  {
    name: 'auth_refresh',
    description:
      'Rotate the token pair using the stored refresh token. ' +
      'Call this automatically when any tool returns HTTP 401.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'auth_logout',
    description:
      'Invalidate the session on the server and delete the local session file. ' +
      'Uses the stored refresh token if none is provided.',
    inputSchema: {
      type: 'object',
      properties: {
        refreshToken: {
          type: 'string',
          description: 'Refresh token to invalidate. Defaults to the stored one.',
        },
      },
    },
  },
  {
    name: 'auth_me',
    description: 'Get the profile of the currently authenticated user.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Resources ─────────────────────────────────────────────────────────────
  {
    name: 'resource_list',
    description: 'List all resources with pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        page: { type: 'number', description: 'Page number (default: 1)' },
        limit: { type: 'number', description: 'Items per page (default: 10)' },
      },
    },
  },
  {
    name: 'resource_get',
    description: 'Get a single resource by its UUID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Resource UUID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'resource_create',
    description: 'Create a new resource. Requires the resources:write permission.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Resource name (max 100 chars)' },
        description: { type: 'string', description: 'Optional description (max 500 chars)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'resource_update',
    description: 'Update a resource. Owner or admin only.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Resource UUID' },
        name: { type: 'string', description: 'New name (max 100 chars)' },
        description: { type: 'string', description: 'New description (max 500 chars)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'resource_delete',
    description: 'Delete a resource. Admin role required.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Resource UUID' },
      },
      required: ['id'],
    },
  },

  // ── Health ────────────────────────────────────────────────────────────────
  {
    name: 'health_check',
    description: 'Check the health of the Armature backend (database + Redis).',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Tool handler
// ---------------------------------------------------------------------------

async function handleTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    // Auth
    case 'auth_methods':
      return apiCall('GET', '/api/auth/methods', undefined, null);

    case 'auth_register': {
      const result = await apiCall<AuthResponse>('POST', '/api/auth/register', args, null);
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
      saveSession({ accessToken, refreshToken });
      return { message: 'Registered and logged in. Session persisted.', user: result.user };
    }

    case 'auth_login': {
      const result = await apiCall<AuthResponse>('POST', '/api/auth/login', args, null);
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
      saveSession({ accessToken, refreshToken });
      return { message: 'Logged in. Session persisted.', user: result.user };
    }

    case 'auth_refresh': {
      if (!refreshToken) {
        throw new Error('No refresh token in session. Call auth_login first.');
      }
      // The jwt-refresh strategy reads the token from the Authorization Bearer header
      const result = await apiCall<TokensResponse>('POST', '/api/auth/refresh', undefined, refreshToken);
      accessToken = result.accessToken;
      refreshToken = result.refreshToken;
      saveSession({ accessToken, refreshToken });
      return { message: 'Token pair rotated. Session persisted.' };
    }

    case 'auth_logout': {
      const token = (args['refreshToken'] as string | undefined) ?? refreshToken;
      if (!token) throw new Error('No refresh token available. Already logged out?');
      await apiCall('POST', '/api/auth/logout', { refreshToken: token });
      accessToken = null;
      refreshToken = null;
      clearSession();
      return { message: 'Logged out. Session file deleted.' };
    }

    case 'auth_me':
      return apiCall('GET', '/api/auth/me');

    // Resources
    case 'resource_list': {
      const params = new URLSearchParams();
      if (args['page'] !== undefined) params.set('page', String(args['page']));
      if (args['limit'] !== undefined) params.set('limit', String(args['limit']));
      const qs = params.toString();
      return apiCall('GET', `/api/resources${qs ? `?${qs}` : ''}`);
    }

    case 'resource_get':
      return apiCall('GET', `/api/resources/${args['id']}`);

    case 'resource_create':
      return apiCall('POST', '/api/resources', args);

    case 'resource_update': {
      const { id, ...body } = args;
      return apiCall('PATCH', `/api/resources/${id}`, body);
    }

    case 'resource_delete':
      await apiCall('DELETE', `/api/resources/${args['id']}`);
      return { message: 'Resource deleted.' };

    // Health
    case 'health_check':
      return apiCall('GET', '/health', undefined, null);

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// MCP server bootstrap
// ---------------------------------------------------------------------------

const server = new Server(
  { name: 'armature', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    const result = await handleTool(name, args as Record<string, unknown>);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
