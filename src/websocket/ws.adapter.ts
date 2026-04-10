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
  private readonly isProduction: boolean;

  constructor(app: INestApplication) {
    super(app);
    const config = app.get<ConfigService<Env, true>>(ConfigService);
    this.corsOrigin = config.get('CORS_ORIGIN', { infer: true });
    this.isProduction =
      config.get('NODE_ENV', { infer: true }) === 'production';
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: {
        // CORS_ORIGIN set → use it (all environments).
        // Production without CORS_ORIGIN → deny cross-origin (false) to avoid
        //   accidentally allowing credentialed requests from any origin.
        // Non-production without CORS_ORIGIN → reflect request origin (true)
        //   for developer convenience (works with credentials, no wildcard).
        origin: this.corsOrigin ?? (this.isProduction ? false : true),
        credentials: true,
      },
    }) as Server;
  }
}
