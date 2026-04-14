#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

const BASE_URL = process.env['ARMATURE_BASE_URL'] ?? 'http://localhost:3000';

/** JWT stored in memory after auth_login / auth_register */
let accessToken: string | null = process.env['ARMATURE_TOKEN'] ?? null;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function apiCall<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

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

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const TOOLS: Tool[] = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    name: 'auth_methods',
    description: 'List available authentication methods (password, Google OAuth…)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'auth_register',
    description:
      'Register a new user account. Stores the JWT automatically for subsequent calls.',
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
      'Log in with email and password. Stores the JWT automatically for subsequent calls.',
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
    name: 'auth_logout',
    description: 'Invalidate the current session. Clears the stored JWT.',
    inputSchema: {
      type: 'object',
      properties: {
        refreshToken: { type: 'string', description: 'Refresh token to invalidate' },
      },
      required: ['refreshToken'],
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
        description: {
          type: 'string',
          description: 'Optional description (max 500 chars)',
        },
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

async function handleTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    // Auth
    case 'auth_methods':
      return apiCall('GET', '/api/auth/methods', undefined, false);

    case 'auth_register': {
      const result = await apiCall<AuthResponse>('POST', '/api/auth/register', args, false);
      accessToken = result.accessToken;
      return { message: 'Registered and logged in', user: result.user, refreshToken: result.refreshToken };
    }

    case 'auth_login': {
      const result = await apiCall<AuthResponse>('POST', '/api/auth/login', args, false);
      accessToken = result.accessToken;
      return { message: 'Logged in', user: result.user, refreshToken: result.refreshToken };
    }

    case 'auth_logout': {
      await apiCall('POST', '/api/auth/logout', { refreshToken: args['refreshToken'] });
      accessToken = null;
      return { message: 'Logged out' };
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
      return { message: 'Resource deleted' };

    // Health
    case 'health_check':
      return apiCall('GET', '/health', undefined, false);

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
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
