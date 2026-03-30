import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validate } from './env.validation.js';

/**
 * Global config module — wraps @nestjs/config with Zod validation.
 * ConfigService is available everywhere without importing this module.
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
      cache: true,
    }),
  ],
})
export class AppConfigModule {}
