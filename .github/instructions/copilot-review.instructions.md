---
applyTo: "**"
---

# Copilot review instructions for Armature

This is a NestJS 11 boilerplate. When reviewing PRs, focus on correctness and
adherence to the project conventions below. Avoid commenting on stylistic
preferences already enforced by ESLint/Prettier, and avoid suggesting
architectural refactors unless there is a clear bug or security issue.

## Conventions to enforce

### Errors
- Exceptions must use `ErrorCode` constants from
  `src/common/constants/error-constants.ts` — never raw strings.
- New `ErrorCode` values must have translations in both `en.ts` and `fr.ts`.

### Serialization
- Services must never return raw Prisma objects. Responses must go through
  `serialize(DtoClass, data)` with `@Expose()` fields only.

### Guards and auth
- All HTTP routes are JWT-protected by default. Public routes use `@Public()`.
- WebSocket authentication runs in `afterInit()` via `server.use()` middleware
  (not `handleConnection`). Sockets that fail auth never reach connected state.
- `WsJwtGuard` is a secondary check on individual `@SubscribeMessage` handlers.

### WebSocket policies
- Events without a registered policy are broadcast to **all authenticated
  clients**. Any event carrying user-specific or sensitive data must have a
  `WsPolicyFn` registered via `WsPolicyRegistry`.
- Policy functions must not throw — failures are caught and logged per-socket.

### Async and promises
- WebSocket `emit()` calls from services must be fire-and-forget:
  `void this.ws.emit(...).catch(err => this.logger.warn(...))`.
  Use the `emitEvent()` helper pattern from `ResourceService` as reference.
- Error objects logged as metadata must use `err.message` + `err.stack`, not
  the raw `err` object (which serialises to `{}`).

### CORS
- HTTP and WebSocket CORS follow the same rule: `CORS_ORIGIN` env var when
  set, `false` in production when unset, `true` (reflect origin) otherwise.

## What to skip
- Do not flag ESLint/Prettier formatting — CI enforces it.
- Do not suggest adding comments or JSDoc where none exist unless there is
  a genuine clarity issue.
- Do not suggest extracting abstractions for one-off patterns.
- Do not re-comment on issues that have already been addressed in a subsequent
  commit in the same PR.
