import { Inject, Injectable } from '@nestjs/common';
import type { LoggerPort } from './logger.port.js';
import { type LogEntry, LogLevel, LOGGER_PORT } from './logger.port.js';

/**
 * Application-wide logger service.
 *
 * Delegates every log entry to the registered {@link LoggerPort} adapter.
 * The adapter is swappable (console → file → external) without touching
 * any consuming code.
 *
 * @example
 * ```ts
 * constructor(logger: LoggerService) {
 *   this.logger = logger.withContext('OrderService');
 * }
 * this.logger.log('Order created', { orderId });
 * ```
 */
@Injectable()
export class LoggerService {
  private context = 'App';
  private minLevel: LogLevel = LogLevel.DEBUG;

  constructor(@Inject(LOGGER_PORT) private readonly adapter: LoggerPort) {
    const envLevel = process.env['LOG_LEVEL']?.toUpperCase();
    if (envLevel && envLevel in LogLevel) {
      this.minLevel = LogLevel[envLevel as keyof typeof LogLevel] as LogLevel;
    }
  }

  /** Returns a new instance scoped to the given context name. */
  withContext(context: string): LoggerService {
    const scoped = new LoggerService(this.adapter);
    scoped.context = context;
    scoped.minLevel = this.minLevel;
    return scoped;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.DEBUG, message, meta);
  }

  log(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.LOG, message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.WARN, message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.emit(LogLevel.ERROR, message, meta);
  }

  private emit(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): void {
    if (level < this.minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      timestamp: new Date().toISOString(),
      meta,
    };

    this.adapter.write(entry);
  }
}
