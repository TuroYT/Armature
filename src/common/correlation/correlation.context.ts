import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Per-request context propagated via AsyncLocalStorage.
 * Anything stored here is automatically available in any async code path
 * triggered by the current HTTP request — no plumbing required.
 */
export interface RequestContext {
  correlationId: string;
}

export const correlationStorage = new AsyncLocalStorage<RequestContext>();

/** Returns the active correlation ID, or `undefined` outside a request scope. */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}
