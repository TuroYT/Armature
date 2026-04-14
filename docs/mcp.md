# Armature MCP server

The MCP (Model Context Protocol) server in `mcp/src/index.ts` exposes the
Armature REST API as tools that Claude can call directly from a conversation.

---

## Setup

No separate install step is required. The server uses the root project's
`node_modules` (both `tsx` and `@modelcontextprotocol/sdk` are root
devDependencies).

```bash
# At the project root — one command covers everything
npm install
```

The server is registered in `.claude/settings.json` and starts automatically
when Claude Code opens the project:

```json
{
  "mcpServers": {
    "armature": {
      "command": "./node_modules/.bin/tsx",
      "args": ["mcp/src/index.ts"],
      "env": {
        "ARMATURE_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `ARMATURE_BASE_URL` | `http://localhost:3000` | Backend base URL |
| `ARMATURE_TOKEN` | — | Pre-load an access token (skips `auth_login`) |

---

## Session persistence

After a successful `auth_login` or `auth_register`, both the access token and
the refresh token are written to `.claude/.armature-session.json`:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

This file is loaded at server startup, so the session survives MCP restarts
(e.g. after closing and reopening Claude Code). It is listed in `.gitignore`
and must never be committed.

`auth_logout` deletes the file and clears the in-memory tokens.

---

## Authentication flow

```
auth_login / auth_register
        │
        ▼
  saveSession()  ──→  .claude/.armature-session.json
        │
        ▼
  (use tools freely)
        │
  access token expires?
        │
        ▼
  auth_refresh  ──→  new pair saved to session file
        │
        ▼
  auth_logout  ──→  session file deleted
```

**Rule**: if any authenticated tool returns `HTTP 401`, call `auth_refresh`
then retry the original tool. If `auth_refresh` also fails, call `auth_login`
again.

---

## Tools reference

### Auth

#### `auth_methods`
List authentication methods enabled on the server.

- **Auth required**: No
- **Endpoint**: `GET /api/auth/methods`
- **Parameters**: none

---

#### `auth_register`
Register a new user account and log in immediately.

- **Auth required**: No
- **Endpoint**: `POST /api/auth/register`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `email` | string | Yes | User email |
| `password` | string | Yes | Min 8 characters |
| `firstName` | string | No | First name |
| `lastName` | string | No | Last name |

- **Side effect**: persists the session to `.claude/.armature-session.json`

---

#### `auth_login`
Log in with email and password.

- **Auth required**: No
- **Endpoint**: `POST /api/auth/login`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `email` | string | Yes | — |
| `password` | string | Yes | — |

- **Side effect**: persists the session to `.claude/.armature-session.json`

---

#### `auth_refresh`
Rotate the token pair using the stored refresh token.

- **Auth required**: Uses stored **refresh** token as Bearer (not access token)
- **Endpoint**: `POST /api/auth/refresh`
- **Parameters**: none
- **Side effect**: overwrites the session file with the new token pair
- **Error**: throws if no refresh token is in the current session

The Armature backend uses a single-use refresh token strategy: each call to
`/api/auth/refresh` invalidates the old refresh token and issues a new one.

---

#### `auth_logout`
Invalidate the session on the server and delete the local session file.

- **Auth required**: Yes (access token)
- **Endpoint**: `POST /api/auth/logout`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `refreshToken` | string | No | Defaults to the stored refresh token |

- **Side effect**: clears in-memory tokens and deletes `.claude/.armature-session.json`

---

#### `auth_me`
Get the profile of the currently authenticated user.

- **Auth required**: Yes
- **Endpoint**: `GET /api/auth/me`
- **Parameters**: none

---

### Resources

#### `resource_list`
List resources with pagination.

- **Auth required**: Yes
- **Endpoint**: `GET /api/resources`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 10) |

---

#### `resource_get`
Fetch a single resource by ID.

- **Auth required**: Yes
- **Endpoint**: `GET /api/resources/:id`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Resource UUID |

---

#### `resource_create`
Create a new resource.

- **Auth required**: Yes — requires `resources:write` permission
- **Endpoint**: `POST /api/resources`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `name` | string | Yes | Max 100 chars |
| `description` | string | No | Max 500 chars |

---

#### `resource_update`
Update an existing resource.

- **Auth required**: Yes — owner or admin only
- **Endpoint**: `PATCH /api/resources/:id`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Resource UUID |
| `name` | string | No | New name (max 100 chars) |
| `description` | string | No | New description (max 500 chars) |

---

#### `resource_delete`
Delete a resource permanently.

- **Auth required**: Yes — `admin` role required
- **Endpoint**: `DELETE /api/resources/:id`
- **Parameters**:

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Resource UUID |

---

### Health

#### `health_check`
Check the status of the backend and its dependencies.

- **Auth required**: No
- **Endpoint**: `GET /health`
- **Parameters**: none
- **Returns**: status of `database` and `redis` indicators

---

## Adding a tool for a new endpoint

When you add a new REST endpoint to the backend, mirror it in the MCP:

1. **Define the tool** — add an entry to the `TOOLS` array in `mcp/src/index.ts`:

```ts
{
  name: 'my_feature_create',
  description: 'One-line description of what this does.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Field description' },
    },
    required: ['name'],
  },
},
```

2. **Handle it** — add a `case` in `handleTool()`:

```ts
case 'my_feature_create':
  return apiCall('POST', '/api/my-feature', args);
```

3. **Update the docs** — add a row to the tools table in `CLAUDE.md` and a
   full entry in this file.

---

## Source layout

```
mcp/
└── src/
    └── index.ts    Single-file MCP server (~230 lines)
```

All dependencies (`@modelcontextprotocol/sdk`, `tsx`) live in the root
`node_modules` — no separate install is needed inside `mcp/`.
