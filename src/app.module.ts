import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

import { AppConfigModule } from './config/config.module.js';
import { LoggerModule } from './common/logger/logger.module.js';
import { CommonModule } from './common/common.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CacheModule } from './cache/cache.module.js';
import { AuthModule } from './auth/auth.module.js';
import { HealthModule } from './health/health.module.js';
import { ResourceModule } from './resource/resource.module.js';

// Optional modules — self-activate based on env vars, Swagger reflects active state
import { GoogleAuthModule } from './auth/social/google-auth.module.js';
import { QueueModule } from './queue/queue.module.js';
import { PaymentModule } from './payment/payment.module.js';
import { WebsocketModule } from './websocket/websocket.module.js';

import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { HttpLoggingInterceptor } from './common/logger/http-logging.interceptor.js';
import { JwtAuthGuard } from './auth/auth.guard.js';

@Module({
  imports: [
    // ── Core ─────────────────────────────────────────────────────────────────
    AppConfigModule,
    LoggerModule,
    CommonModule,
    PrismaModule,
    CacheModule,

    // ── Rate limiting ─────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1_000, limit: 10 }, // 10 req/sec
      { name: 'long', ttl: 60_000, limit: 100 }, // 100 req/min
    ]),

    // ── Feature modules ───────────────────────────────────────────────────────
    AuthModule,
    HealthModule,

    // ── Example resource (remove when using Armature as your base) ────────────
    ResourceModule,

    // ── WebSocket (real-time events) ──────────────────────────────────────────
    WebsocketModule,

    // ── Optional modules (self-activate, no code change needed) ──────────────
    GoogleAuthModule.register(), // needs: GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET
    QueueModule.register(), // needs: REDIS_URL
    PaymentModule.register(), // needs: STRIPE_SECRET_KEY
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
  ],
})
export class AppModule {}
