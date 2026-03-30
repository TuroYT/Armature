import { LogEntry, LogLevel, LoggerPort } from '../logger.port.js';

/**
 * Console adapter with two output modes:
 *
 * - **development**: human-readable coloured text
 * - **production**: single-line JSON (for log aggregators — Datadog, Loki, CloudWatch…)
 */
export class ConsoleLoggerAdapter implements LoggerPort {
  private readonly isProduction = process.env['NODE_ENV'] === 'production';

  private static readonly COLORS: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: '\x1b[36m', // cyan
    [LogLevel.LOG]: '\x1b[32m', // green
    [LogLevel.WARN]: '\x1b[33m', // yellow
    [LogLevel.ERROR]: '\x1b[31m', // red
  };
  private static readonly RESET = '\x1b[0m';

  private static readonly LEVEL_LABELS: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'DEBUG',
    [LogLevel.LOG]: 'LOG',
    [LogLevel.WARN]: 'WARN',
    [LogLevel.ERROR]: 'ERROR',
  };

  write(entry: LogEntry): void {
    try {
      if (this.isProduction) {
        this.writeJson(entry);
      } else {
        this.writeText(entry);
      }
    } catch {
      // Never crash because of a logging failure
    }
  }

  private writeJson(entry: LogEntry): void {
    const payload: Record<string, unknown> = {
      level: ConsoleLoggerAdapter.LEVEL_LABELS[entry.level],
      message: entry.message,
      context: entry.context,
      timestamp: entry.timestamp,
      ...entry.meta,
    };
    const stream =
      entry.level >= LogLevel.ERROR ? process.stderr : process.stdout;
    stream.write(JSON.stringify(payload) + '\n');
  }

  private writeText(entry: LogEntry): void {
    const color = ConsoleLoggerAdapter.COLORS[entry.level];
    const reset = ConsoleLoggerAdapter.RESET;
    const label = ConsoleLoggerAdapter.LEVEL_LABELS[entry.level].padEnd(5);
    const meta =
      entry.meta && Object.keys(entry.meta).length > 0
        ? `  ${JSON.stringify(entry.meta)}`
        : '';

    const line = `${color}[${entry.timestamp}] [${label}] [${entry.context}]${reset} ${entry.message}${meta}`;
    const stream =
      entry.level >= LogLevel.ERROR ? process.stderr : process.stdout;
    stream.write(line + '\n');
  }
}
