import { Global, Module } from '@nestjs/common';
import { LOGGER_PORT } from './logger.port.js';
import { ConsoleLoggerAdapter } from './adapters/console-logger.adapter.js';
import { LoggerService } from './logger.service.js';
import { HttpLoggingInterceptor } from './http-logging.interceptor.js';

/**
 * Global logging module — LoggerService is available everywhere
 * without importing this module explicitly.
 *
 * ### Swapping the adapter
 * Override the LOGGER_PORT provider with your own implementation:
 * ```ts
 * { provide: LOGGER_PORT, useClass: DatadogLoggerAdapter }
 * ```
 */
@Global()
@Module({
  providers: [
    { provide: LOGGER_PORT, useClass: ConsoleLoggerAdapter },
    LoggerService,
    HttpLoggingInterceptor,
  ],
  exports: [LoggerService, HttpLoggingInterceptor],
})
export class LoggerModule {}
