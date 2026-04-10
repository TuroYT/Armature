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
socket.on('error', (err) => console.error('ws error', err));

// Listen for resource events
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

Authentication happens **once at connection time** inside
`WebsocketGateway.handleConnection()`.

1. The gateway reads the JWT from `handshake.auth.token` (preferred) or the
   `Authorization: Bearer <token>` header.
2. The token is verified with `JwtService` using `JWT_SECRET`.
3. On success the decoded user (`{ id, email, roles }`) is stored in
   `client.data.user` for the lifetime of the socket.
4. On failure (missing, expired, or invalid token) the socket is **immediately
   disconnected**. No events can be sent or received.

The global `JwtAuthGuard` used by the REST API is HTTP-only and does **not**
apply to WebSocket connections.

---

## Server → Client events

### Built-in resource events

| Event               | Payload                   | Triggered by             |
|---------------------|---------------------------|--------------------------|
| `resource:created`  | `ResourceResponseDto`     | `POST /api/resources`    |
| `resource:updated`  | `ResourceResponseDto`     | `PATCH /api/resources/:id` |
| `resource:deleted`  | `{ id: string }`          | `DELETE /api/resources/:id` |

All connected authenticated clients receive these broadcasts.

### Error event

When a WebSocket exception occurs the gateway emits an `error` event to the
offending client:

```json
{ "code": "UNAUTHORIZED", "message": "Authentication required" }
```

`code` is always an `ErrorCode` constant.

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

```ts
socket.emit('subscribe', { room: 'resources' });
```

### `unsubscribe`

Leave a named room.

```ts
socket.emit('unsubscribe', { room: 'resources' });
```

---

## Rooms

Rooms allow you to broadcast to a subset of clients instead of everyone.

**Client side** — join a room first:

```ts
socket.emit('subscribe', { room: 'resources' });
```

**Server side** — emit to the room:

```ts
this.ws.emitToRoom('resources', 'resource:created', payload);
```

A client that never calls `subscribe` won't receive room-scoped events, but
will still receive global broadcasts (`this.ws.emit(...)`).

---

## Adding real-time events to a new module

Follow these three steps — no changes to `WebsocketModule` are needed.

### 1. Import `WebsocketModule` in your feature module

```ts
// src/order/order.module.ts
import { WebsocketModule } from '../websocket/websocket.module.js';

@Module({
  imports: [WebsocketModule],
  providers: [OrderService],
  controllers: [OrderController],
})
export class OrderModule {}
```

### 2. Inject `WebsocketGateway` in your service

```ts
// src/order/order.service.ts
import { WebsocketGateway } from '../websocket/websocket.gateway.js';

@Injectable()
export class OrderService {
  constructor(private readonly ws: WebsocketGateway) {}

  async create(dto: CreateOrderDto): Promise<OrderResponseDto> {
    const order = await this.prisma.order.create({ data: dto });
    const response = serialize(OrderResponseDto, order);
    this.ws.emit('order:created', response);   // broadcast to all
    return response;
  }
}
```

### 3. Listen on the client

```ts
socket.on('order:created', (data) => console.log('new order', data));
```

That's it.

---

## Adding custom client → server handlers

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

The `@WsCurrentUser()` decorator injects the user attached during
`handleConnection`. `@UseGuards(WsJwtGuard)` is an extra safety net — in
practice unauthenticated sockets are already disconnected at connection time.

---

## Architecture

```
src/websocket/
├── websocket.module.ts          Module — imports JwtModule, exports Gateway + Guard + Filter
├── websocket.gateway.ts         Socket.IO gateway — auth, emit helpers, built-in handlers
├── guards/
│   └── ws-jwt.guard.ts          Per-event guard (checks client.data.user)
├── filters/
│   └── ws-exception.filter.ts  Catches WsException + unknown errors → emits `error` event
└── decorators/
    └── ws-current-user.decorator.ts   @WsCurrentUser() param decorator
```

The gateway reuses the same HTTP port — no extra port or infrastructure needed.
CORS is configured via the `CORS_ORIGIN` environment variable (same as the REST
API).
