/**
 * Log levels ordered by severity (lowest → highest).
 * Used by adapters to filter messages based on the configured minimum level.
 */
export enum LogLevel {
  DEBUG = 0,
  LOG = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Structured log entry passed to every adapter.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context: string;
  timestamp: string;
  meta?: Record<string, unknown>;
}

/**
 * Abstract port that every logging adapter must implement.
 *
 * To add a new transport (file rotation, external service, etc.),
 * create a class that implements `LoggerPort` and register it
 * via `{ provide: LOGGER_PORT, useClass: MyAdapter }`.
 */
export interface LoggerPort {
  /**
   * Write a single log entry to the underlying transport.
   * Implementations MUST NOT throw — errors must be silently swallowed
   * to avoid crashing the application because of a logging failure.
   */
  write(entry: LogEntry): void;
}

/** Injection token for the LoggerPort adapter. */
export const LOGGER_PORT = Symbol('LOGGER_PORT');
