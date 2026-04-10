import { jest } from '@jest/globals';
import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { WsJwtGuard } from './ws-jwt.guard.js';
import { ErrorCode } from '../../common/constants/error-constants.js';

function makeContext(user: unknown): ExecutionContext {
  return {
    switchToWs: () => ({
      getClient: () => ({ data: { user } }),
    }),
  } as unknown as ExecutionContext;
}

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;

  beforeEach(() => {
    guard = new WsJwtGuard();
  });

  it('returns true when client.data.user is populated', () => {
    const ctx = makeContext({ id: 'u1', email: 'a@b.com', roles: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws WsException(UNAUTHORIZED) when client.data.user is undefined', () => {
    const ctx = makeContext(undefined);
    expect(() => guard.canActivate(ctx)).toThrow(WsException);
    try {
      guard.canActivate(ctx);
    } catch (err) {
      expect(err instanceof WsException && err.getError()).toBe(
        ErrorCode.UNAUTHORIZED,
      );
    }
  });

  it('throws WsException(UNAUTHORIZED) when client.data.user is null', () => {
    const ctx = makeContext(null);
    expect(() => guard.canActivate(ctx)).toThrow(WsException);
  });
});
