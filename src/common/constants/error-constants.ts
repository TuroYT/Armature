/**
 * Typed error codes used across the application.
 *
 * Rules:
 * - Always use an ErrorCode in exceptions — never a raw string literal.
 * - When adding a new code, also add its translation in fr.ts and en.ts.
 * - The Record<ErrorCode, string> type in translation files enforces this at compile time.
 */
export const ErrorCode = {
  // ─── Generic ──────────────────────────────────────────────────────────────
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  NOT_FOUND: 'NOT_FOUND',

  // ─── Authentication ───────────────────────────────────────────────────────
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_REFRESH_TOKEN: 'INVALID_REFRESH_TOKEN',

  // ─── Users ────────────────────────────────────────────────────────────────
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',

  // ─── Permissions ──────────────────────────────────────────────────────────
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // ─── Example Resource (remove when using Armature as a base) ──────────────
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
