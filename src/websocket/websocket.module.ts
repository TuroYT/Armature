import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WebsocketGateway } from './websocket.gateway.js';
import { WsExceptionFilter } from './filters/ws-exception.filter.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import { WsPolicyRegistry } from './policies/ws-policy.registry.js';
import type { Env } from '../config/env.validation.js';

/**
 * WebSocket module — real-time bidirectional communication over Socket.IO.
 *
 * ## How to add real-time events to any feature module
 *
 * 1. Import `WebsocketModule` in your feature module:
 *    ```ts
 *    @Module({ imports: [WebsocketModule], providers: [MyService, MyWsPolicy] })
 *    export class MyModule {}
 *    ```
 *
 * 2. Inject `WebsocketGateway` into your service to emit events:
 *    ```ts
 *    constructor(private readonly ws: WebsocketGateway) {}
 *    await this.ws.emit('my-model:created', dto);
 *    ```
 *
 * 3. Register policies in a dedicated `OnModuleInit` provider:
 *    ```ts
 *    @Injectable()
 *    export class MyWsPolicy implements OnModuleInit {
 *      constructor(private readonly registry: WsPolicyRegistry) {}
 *      onModuleInit() {
 *        this.registry.register<MyDto>('my-model:created', (user, data) =>
 *          user.id === data.ownerId || user.roles.includes('admin'),
 *        );
 *      }
 *    }
 *    ```
 *
 * ## Exports
 * - `WebsocketGateway` — inject to emit server-side events
 * - `WsPolicyRegistry` — inject to register event / room policies
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
  providers: [
    WsPolicyRegistry,
    WebsocketGateway,
    WsExceptionFilter,
    WsJwtGuard,
  ],
  exports: [WebsocketGateway, WsPolicyRegistry, WsJwtGuard, WsExceptionFilter],
})
export class WebsocketModule {}
