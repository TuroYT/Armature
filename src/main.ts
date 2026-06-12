import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { readFileSync } from 'fs';
import { AppModule } from './app.module.js';
import { WsAdapter } from './websocket/ws.adapter.js';
import { LoggerService } from './common/logger/logger.service.js';
import type { Env } from './config/env.validation.js';

function getPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf-8'),
    ) as { version: string };
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

async function bootstrap() {
  // rawBody: true is required for Stripe webhook signature verification —
  // constructEvent() needs the raw Buffer, not the parsed JSON body.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  const corsOrigin = config.get('CORS_ORIGIN', { infer: true });
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  // Require an explicit CORS origin in production — reflecting every origin with
  // credentials enabled is a CSRF vector that misconfiguration can accidentally ship.
  if (isProduction && !corsOrigin) {
    throw new Error(
      'CORS_ORIGIN must be set in production. ' +
        'Set it to your frontend URL (e.g. https://app.example.com).',
    );
  }

  // ── WebSocket adapter ─────────────────────────────────────────────────────
  app.useWebSocketAdapter(new WsAdapter(app));

  // ── Middleware ────────────────────────────────────────────────────────────
  // Helmet sets sensible HTTP security headers (XSS, clickjacking, sniffing…).
  // CSP is disabled because the Swagger UI assets we serve in dev would be
  // blocked otherwise; turn it back on in front of a hardened reverse proxy.
  app.use(helmet({ contentSecurityPolicy: isProduction ? undefined : false }));
  app.use(cookieParser());
  app.enableCors({
    // CORS_ORIGIN set → use it. Production without it → deny cross-origin
    // (false). Non-production without it → reflect request origin (true) for
    // developer convenience. Aligns with WsAdapter's CORS strategy.
    origin: corsOrigin ?? (isProduction ? false : true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      // Reject payloads that contain properties not declared in the DTO.
      // Prevents accidental mass-assignment via unknown fields leaking through.
      forbidNonWhitelisted: true,
    }),
  );

  // ── Swagger (dev only) ────────────────────────────────────────────────────
  if (!isProduction) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Armature API')
      .setDescription(
        'Opinionated NestJS boilerplate — replace with your project description.',
      )
      .setVersion(getPackageVersion())
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
  }

  await app.listen(port);

  const url = await app.getUrl();
  const logger = app.get(LoggerService).withContext('Bootstrap');
  logger.log(`Application running on ${url}`);
  if (!isProduction) {
    logger.log(`Swagger docs: ${url}/api/docs`);
  }
}

void bootstrap();
