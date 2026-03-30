import type { ErrorCode } from '../error-constants.js';

export const en: Record<ErrorCode, string> = {
  // Generic
  INTERNAL_SERVER_ERROR: 'Internal server error',
  BAD_REQUEST: 'Bad request',
  NOT_FOUND: 'Resource not found',

  // Authentication
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  INVALID_CREDENTIALS: 'Invalid email or password',
  INVALID_TOKEN: 'Invalid token',
  TOKEN_EXPIRED: 'Token has expired',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token',

  // Users
  USER_NOT_FOUND: 'User not found',
  USER_ALREADY_EXISTS: 'An account with this email already exists',

  // Permissions
  INSUFFICIENT_PERMISSIONS: 'You do not have permission to perform this action',

  // Example resource
  RESOURCE_NOT_FOUND: 'Resource not found',
  RESOURCE_ALREADY_EXISTS: 'This resource already exists',
};
