# WebSocket — Real-time events

Armature ships a Socket.IO gateway that lets any service broadcast domain events
to connected clients. The connection is authenticated with the same JWT access
token used by the REST API.

---

## Quick start (client side)

```ts
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000', {
  auth: { token: '<access-token>' },   // JWT obtained from POST /api/auth/login
});

socket.on('connect', () => console.log('connected'));
socket.on('disconnect', (reason) => console.log('disconnected', reason));
// Auth failures during the handshake surface as connect_error, not error
socket.on('connect_error', (err) => console.error('connection failed', err.message));
// Runtime WebSocket exceptions (e.g. FORBIDDEN on subscribe)
socket.on('error', (err) => console.error('ws error', err));

// Listen for resource events (only received if the policy allows it)
socket.on('resource:created', (data) => console.log('created', data));
socket.on('resource:updated', (data) => console.log('updated', data));
socket.on('resource:deleted', ({ id }) => console.log('deleted', id));
```

Alternatively, pass the token as a `Bearer` header — useful for server-to-server
or environments where the `auth` option is not available:

```ts
const socket = io('http://localhost:3000', {
  extraHeaders: { Authorization: `Bearer ${token}` },
});
```

---

## Authentication

Authentication runs in a **Socket.IO middleware** registered in
`WebsocketGateway.afterInit()` via `server.use()`. This means the handshake
is rejected **before** the connection is established — unauthenticated sockets
never enter the connected state and cannot emit or receive any events.

1. The middleware reads the JWT from `handshake.auth.token` (preferred) or the
   `Authorization: Bearer <token>` header.
2. The token is verified with `JwtService` using `JWT_SECRET`.
3. On success the decoded user (`{ id, email, roles }`) is stored in
   `socket.data.user` for the lifetime of the socket.
4. On failure (missing, expired, or invalid token) the handshake is **rejected
   immediately** — the client receives a `connect_error` event (not `error`).

The global `JwtAuthGuard` used by the REST API is HTTP-only and does **not**
apply to WebSocket connections.

---

## Policies (row-level security)

WebSocket policies control which clients receive which events — analogous to
Supabase Row-Level Security but applied at the emission layer.

### How it works

When `WebsocketGateway.emit(event, data)` is called:

1. The registry is checked for a policy registered against `event`.
2. **No policy** → event is broadcast to **all** connected clients (open by default).
3. **Policy found** → the payload is evaluated for each connected socket; only
   clients for whom `policy(user, payload) === true` receive the event.

The same logic applies to `emitToRoom()`.

### Registering policies

Create an `OnModuleInit` provider in your feature module:

```ts
// src/order/order.ws-policy.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { WsPolicyRegistry } from '../websocket/policies/ws-policy.registry.js';
import type { OrderResponseDto } from './dto/order-response.dto.js';

@Injectable()
export class OrderWsPolicy implements OnModuleInit {
  constructor(private readonly registry: WsPolicyRegistry) {}

  onModuleInit(): void {
    // Only the order owner or an admin receives this event
    this.registry.register<OrderResponseDto>(
      'order:created',
      (user, order) => user.id === order.ownerId || user.roles.includes('admin'),
    );

    // All authenticated users receive order updates (no restriction)
    this.registry.register<OrderResponseDto>(
      'order:updated',
      () => true,
    );

    // Only admins can subscribe to the shared 'orders' room
    this.registry.registerRoomPolicy(
      'orders',
      (user) => user.roles.includes('admin'),
    );
  }
}
```

Register it in your module:

```ts
// src/order/order.module.ts
@Module({
  imports: [WebsocketModule],
  providers: [OrderService, OrderWsPolicy],
  controllers: [OrderController],
})
export class OrderModule {}
```

### Policy function signature

```ts
// Event policy
type WsPolicyFn<T> = (user: AuthUser, payload: T) => boolean | Promise<boolean>;

// Room policy
type WsRoomPolicyFn = (user: AuthUser) => boolean | Promise<boolean>;
```

`AuthUser` is `{ id: string; email: string; roles: string[] }` — the same shape
as the REST API's `@CurrentUser()`.

### Built-in resource policies (`src/resource/resource.ws-policy.ts`)

| Event               | Rule                                                    |
|---------------------|---------------------------------------------------------|
| `resource:created`  | Admin **or** resource owner (`ownerId === user.id`)     |
| `resource:updated`  | Admin **or** resource owner                             |
| `resource:deleted`  | Admin only (payload has no `ownerId`)                   |
| Room `resources`    | Admin only                                              |

---

## Server → Client events

### Built-in resource events

| Event               | Payload                   | Triggered by               |
|---------------------|---------------------------|----------------------------|
| `resource:created`  | `ResourceResponseDto`     | `POST /api/resources`      |
| `resource:updated`  | `ResourceResponseDto`     | `PATCH /api/resources/:id` |
| `resource:deleted`  | `{ id: string }`          | `DELETE /api/resources/:id`|

### Error event

When a WebSocket exception occurs, the gateway emits an `error` event to the
offending client:

```json
{ "code": "UNAUTHORIZED", "message": "Authentication required" }
```

`code` is always an `ErrorCode` constant. `message` is translated via
`I18nService` using the `Accept-Language` header from the Socket.IO handshake
(same behaviour as the HTTP exception filter). Default locale is `en`.

---

## Client → Server events

### `ping`

Liveness check. The server replies with a `pong` event.

```ts
socket.emit('ping');
socket.on('pong', ({ userId, timestamp }) => console.log('alive', timestamp));
```

### `subscribe`

Join a named room to receive scoped broadcasts (see [Rooms](#rooms)).
If a room policy is registered, the user must pass it or receive a `FORBIDDEN` error.

```ts
socket.emit('subscribe', { room: 'resources' });
```

### `unsubscribe`

Leave a named room.

```ts
socket.emit('unsubscribe', { room: 'resources' });
```

### Adding custom handlers

Add a `@SubscribeMessage` method to `WebsocketGateway` (or create a separate
gateway in your own module):

```ts
@UseGuards(WsJwtGuard)
@SubscribeMessage('order:confirm')
handleConfirm(
  @MessageBody() body: { orderId: string },
  @WsCurrentUser() user: AuthUser,
): WsResponse<{ ok: boolean }> {
  // business logic …
  return { event: 'order:confirmed', data: { ok: true } };
}
```

`@WsCurrentUser()` injects the user stored at connection time.
`@UseGuards(WsJwtGuard)` is an extra safety net — in practice, unauthenticated
sockets are already disconnected at `handleConnection`.

---

## Rooms

Rooms let you broadcast to a subset of clients instead of everyone.

**Client side** — join a room first:

```ts
socket.emit('subscribe', { room: 'resources' });
```

**Server side** — emit to the room (policy applies):

```ts
await this.ws.emitToRoom('resources', 'resource:updated', payload);
```

A client that never joins a room won't receive room-scoped events, but will
still receive global broadcasts (`this.ws.emit(...)`).

---

## Adding real-time events to a new module

### 1. Import `WebsocketModule`

```ts
// src/order/order.module.ts
@Module({
  imports: [WebsocketModule],
  providers: [OrderService, OrderWsPolicy],
  controllers: [OrderController],
})
export class OrderModule {}
```

### 2. Inject `WebsocketGateway` and emit events

```ts
// src/order/order.service.ts
@Injectable()
export class OrderService {
  constructor(private readonly ws: WebsocketGateway) {}

  async create(dto: CreateOrderDto): Promise<OrderResponseDto> {
    const order = await this.prisma.order.create({ data: dto });
    const response = serialize(OrderResponseDto, order);
    await this.ws.emit('order:created', response); // filtered by policy
    return response;
  }
}
```

### 3. Define policies (optional)

See [Registering policies](#registering-policies) above.

### 4. Listen on the client

```ts
socket.on('order:created', (data) => console.log('new order', data));
```

---

## Architecture

```
src/websocket/
├── websocket.module.ts               Module — provides & exports Gateway, Registry, Guard, Filter
├── websocket.gateway.ts              Socket.IO gateway — auth, policy-aware emit, built-in handlers
├── policies/
│   └── ws-policy.registry.ts         Injectable registry — register event & room policies
├── guards/
│   └── ws-jwt.guard.ts               Per-event guard (checks client.data.user)
├── filters/
│   └── ws-exception.filter.ts        Catches WsException + unknown errors → emits `error` event
└── decorators/
    └── ws-current-user.decorator.ts  @WsCurrentUser() param decorator

src/resource/
└── resource.ws-policy.ts             Example domain policy (owner / admin rules)
```

The gateway reuses the same HTTP port — no extra port or infrastructure needed.
CORS is configured via the `CORS_ORIGIN` environment variable (same as the REST API).
