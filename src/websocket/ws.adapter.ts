import { IoAdapter } from '@nestjs/platform-socket.io';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import { type Server, type ServerOptions } from 'socket.io';
import type { Env } from '../config/env.validation.js';

/**
 * Custom Socket.IO adapter that reads CORS configuration from the validated
 * `ConfigService` instead of `process.env`, keeping it consistent with the
 * rest of the application.
 *
 * Registered in `main.ts`:
 * ```ts
 * app.useWebSocketAdapter(new WsAdapter(app));
 * ```
 */
export class WsAdapter extends IoAdapter {
  private readonly corsOrigin: string | undefined;

  constructor(app: INestApplication) {
    super(app);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    this.corsOrigin = config.get('CORS_ORIGIN', { infer: true });
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: {
        // When CORS_ORIGIN is not set, reflect the request origin (origin: true)
        // instead of wildcard ('*'). Browsers reject credentialed requests with
        // origin: '*', so this keeps credentials working in dev without an
        // explicit origin while remaining safe (only the requesting origin is
        // reflected, not all origins blindly accepted).
        origin: this.corsOrigin ?? true,
        credentials: true,
      },
    }) as Server;
  }
}
