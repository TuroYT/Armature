import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { AppModule } from './app.module.js';
import { WsAdapter } from './websocket/ws.adapter.js';
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
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const config = app.get(ConfigService<Env, true>);
  const port = config.get('PORT', { infer: true });
  const corsOrigin = config.get('CORS_ORIGIN', { infer: true });
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';

  // ── WebSocket adapter ─────────────────────────────────────────────────────
  app.useWebSocketAdapter(new WsAdapter(app));

  // ── Middleware ────────────────────────────────────────────────────────────
  app.use(cookieParser());
  app.enableCors({
    // When CORS_ORIGIN is unset, reflect the request origin (true) instead of
    // '*' — browsers reject credentialed requests with a wildcard origin.
    // This matches the behaviour of WsAdapter when no origin is configured.
    origin: corsOrigin ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
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
  console.log(`Application running on ${url}`);
  if (!isProduction) {
    console.log(`Swagger docs: ${url}/api/docs`);
  }
}

void bootstrap();
