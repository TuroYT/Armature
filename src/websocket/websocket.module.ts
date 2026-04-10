import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebsocketGateway } from './websocket.gateway.js';
import { WsExceptionFilter } from './filters/ws-exception.filter.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import type { Env } from '../config/env.validation.js';

/**
 * WebSocket module — real-time bidirectional communication over Socket.IO.
 *
 * ## How to add real-time events to any feature module
 *
 * 1. Import `WebsocketModule` in your feature module:
 *    ```ts
 *    @Module({ imports: [WebsocketModule], providers: [MyService] })
 *    export class MyModule {}
 *    ```
 *
 * 2. Inject `WebsocketGateway` into your service:
 *    ```ts
 *    constructor(private readonly ws: WebsocketGateway) {}
 *    ```
 *
 * 3. Emit events after mutations:
 *    ```ts
 *    this.ws.emit('my-model:created', dto);
 *    this.ws.emitToRoom('my-room', 'my-model:updated', dto);
 *    ```
 *
 * ## Exports
 * - `WebsocketGateway` — inject to emit server-side events
 * - `WsJwtGuard` — guard for per-event authentication checks
 * - `WsExceptionFilter` — WS exception filter (applied globally on the gateway)
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [WebsocketGateway, WsExceptionFilter, WsJwtGuard],
  exports: [WebsocketGateway, WsJwtGuard, WsExceptionFilter],
})
export class WebsocketModule {}
