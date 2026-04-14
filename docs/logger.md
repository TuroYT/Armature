# Logger

## Overview

Armature uses a structured logger built on a **port/adapter pattern** that decouples logging consumers from the transport.

- `LoggerPort` — abstract interface every adapter must implement
- `ConsoleLoggerAdapter` — default adapter: coloured text in `development`, JSON in `production`
- `LoggerService` — injectable service used throughout the app

`LoggerModule` is `@Global()` — `LoggerService` is available everywhere without importing the module.

## Usage

Always inject `LoggerService` and create a scoped instance in the constructor:

```ts
import { LoggerService } from '../common/logger/logger.service.js';

@Injectable()
export class MyService {
  private readonly logger: LoggerService;

  constructor(logger: LoggerService) {
    this.logger = logger.withContext('MyService');
  }

  doSomething(id: string) {
    this.logger.debug('Starting operation', { id });

    try {
      // ...
      this.logger.log('Operation completed', { id, result: 'ok' });
    } catch (err) {
      this.logger.error('Operation failed', {
        id,
        error: (err as Error).message,
      });
    }
  }
}
```

## Log levels

| Method    | Level   | When to use                                                             |
| --------- | ------- | ----------------------------------------------------------------------- |
| `debug()` | `DEBUG` | Troubleshooting — values, branching, step-by-step                       |
| `log()`   | `LOG`   | Normal application events — user created, email sent                    |
| `warn()`  | `WARN`  | Non-critical unexpected states — Redis unavailable, deprecated path hit |
| `error()` | `ERROR` | Failures that need attention — unhandled exception, external API down   |

The minimum level is controlled by `LOG_LEVEL` (default: `DEBUG`). Messages below the threshold are silently discarded.

## Rules

!!! danger "No console.log"
    Never use `console.log` or `console.error`. They bypass log levels, produce unstyled output in development, and unstructured text in production. Always inject `LoggerService`.

- Always call `logger.withContext('ClassName')` in the constructor
- Pass structured data as the second argument — never interpolate it into the message string
- HTTP request logging and unhandled exception logging are **automatic** (global interceptor + filter) — do not re-log them manually in controllers

## Automatic logging

| What                                               | Where                                       |
| -------------------------------------------------- | ------------------------------------------- |
| Incoming requests (method, path, status, duration) | `HttpLoggingInterceptor` — applied globally |
| Unhandled HTTP exceptions                          | `HttpExceptionFilter` — applied globally    |

## Output format

=== "Development"

    Coloured, human-readable:

    ```
    [2024-01-15 10:23:45] LOG     [AuthService] User logged in { userId: 'abc123' }
    [2024-01-15 10:23:45] WARN    [CacheService] Redis error { error: 'ECONNREFUSED' }
    ```

=== "Production"

    Newline-delimited JSON (ready for log aggregation):

    ```json
    {"level":"LOG","context":"AuthService","message":"User logged in","timestamp":"2024-01-15T10:23:45.000Z","meta":{"userId":"abc123"}}
    {"level":"WARN","context":"CacheService","message":"Redis error","timestamp":"2024-01-15T10:23:45.000Z","meta":{"error":"ECONNREFUSED"}}
    ```

## Adding a custom adapter

To add a new transport (file rotation, Datadog, Loki…):

1. Create a class that implements `LoggerPort`:

   ```ts
   // src/common/logger/adapters/datadog.adapter.ts
   import type { LogEntry, LoggerPort } from '../logger.port.js';

   export class DatadogAdapter implements LoggerPort {
     write(entry: LogEntry): void {
       // send to Datadog — never throw
     }
   }
   ```

2. Register it in `LoggerModule`:

   ```ts
   { provide: LOGGER_PORT, useClass: DatadogAdapter }
   ```

The rest of the application requires no changes.
