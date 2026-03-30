# Error Codes & i18n

## Overview

All application errors use typed `ErrorCode` constants. Raw string literals are never passed to exceptions. The global `HttpExceptionFilter` automatically translates codes based on the client's `Accept-Language` header.

## ErrorCode reference

```ts
// src/common/constants/error-constants.ts

// Generic
INTERNAL_SERVER_ERROR;
BAD_REQUEST;
NOT_FOUND;

// Authentication
UNAUTHORIZED;
FORBIDDEN;
INVALID_CREDENTIALS;
INVALID_TOKEN;
TOKEN_EXPIRED;
INVALID_REFRESH_TOKEN;

// Users
USER_NOT_FOUND;
USER_ALREADY_EXISTS;

// Permissions
INSUFFICIENT_PERMISSIONS;

// Example resource (remove when using Armature as a base)
RESOURCE_NOT_FOUND;
RESOURCE_ALREADY_EXISTS;
```

## Usage

```ts
import { ErrorCode } from '../common/constants/error-constants.js';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

// Correct
throw new NotFoundException(ErrorCode.RESOURCE_NOT_FOUND);
throw new ForbiddenException(ErrorCode.FORBIDDEN);

// Wrong — never do this
throw new NotFoundException('Resource not found');
```

## Error response shape

All HTTP errors return:

```json
{
  "statusCode": 404,
  "error": "RESOURCE_NOT_FOUND",
  "message": "The requested resource does not exist."
}
```

The `message` field is translated; `error` always contains the machine-readable code.

## Adding a new error code

**1.** Add the code to `error-constants.ts`:

```ts
export const ErrorCode = {
  // ... existing codes
  INVOICE_NOT_FOUND: 'INVOICE_NOT_FOUND',
} as const;
```

**2.** Add a translation in `src/common/constants/translations/fr.ts`:

```ts
export const fr: Record<ErrorCode, string> = {
  // ... existing translations
  INVOICE_NOT_FOUND: 'La facture demandée est introuvable.',
};
```

**3.** Add a translation in `src/common/constants/translations/en.ts`:

```ts
export const en: Record<ErrorCode, string> = {
  // ... existing translations
  INVOICE_NOT_FOUND: 'The requested invoice does not exist.',
};
```

!!! tip
The `Record<ErrorCode, string>` type enforces completeness at compile time. TypeScript will error if a translation is missing in any language file.

**4.** Use the code normally:

```ts
throw new NotFoundException(ErrorCode.INVOICE_NOT_FOUND);
```

## Supported languages

| Code | Language                  |
| ---- | ------------------------- |
| `fr` | French (default fallback) |
| `en` | English                   |

The language is resolved from the `Accept-Language` request header. If no match is found, French is used.

## Adding a new language

1. Create `src/common/constants/translations/{locale}.ts` with a `Record<ErrorCode, string>` object
2. Import it in `src/common/constants/translations/index.ts`
3. Add the locale to the `SupportedLanguage` union type
4. Add it to the `translations` map in `index.ts`
