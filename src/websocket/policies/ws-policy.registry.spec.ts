import { jest } from '@jest/globals';
import { WsPolicyRegistry } from './ws-policy.registry.js';
import type { AuthUser } from '../../auth/strategies/jwt.strategy.js';

const mockLogger = {
  withContext: jest.fn().mockReturnThis(),
  debug: jest.fn(),
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const adminUser: AuthUser = { id: 'u1', email: 'admin@a.com', roles: ['admin'] };
const regularUser: AuthUser = { id: 'u2', email: 'user@a.com', roles: [] };

describe('WsPolicyRegistry', () => {
  let registry: WsPolicyRegistry;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
    registry = new WsPolicyRegistry(mockLogger as any);
  });

  describe('event policies', () => {
    it('returns undefined for unregistered events', () => {
      expect(registry.getEventPolicy('unknown:event')).toBeUndefined();
    });

    it('stores and retrieves a registered policy', () => {
      const policy = jest.fn().mockReturnValue(true);
      registry.register('order:created', policy as never);
      expect(registry.getEventPolicy('order:created')).toBe(policy);
    });

    it('allows delivery when policy returns true', async () => {
      registry.register<{ ownerId: string }>(
        'item:created',
        (user, data) => user.id === data.ownerId,
      );
      const policy = registry.getEventPolicy('item:created')!;
      expect(await policy(adminUser, { ownerId: adminUser.id })).toBe(true);
      expect(await policy(regularUser, { ownerId: adminUser.id })).toBe(false);
    });

    it('overwrites a previously registered policy', () => {
      const first = jest.fn().mockReturnValue(false);
      const second = jest.fn().mockReturnValue(true);
      registry.register('evt', first as never);
      registry.register('evt', second as never);
      expect(registry.getEventPolicy('evt')).toBe(second);
    });
  });

  describe('room policies', () => {
    it('returns undefined for unregistered rooms', () => {
      expect(registry.getRoomPolicy('unknown-room')).toBeUndefined();
    });

    it('stores and retrieves a registered room policy', () => {
      const policy = (user: AuthUser) => user.roles.includes('admin');
      registry.registerRoomPolicy('admin', policy);
      expect(registry.getRoomPolicy('admin')).toBe(policy);
    });

    it('allows admin and denies regular user', async () => {
      registry.registerRoomPolicy('admin', (user) =>
        user.roles.includes('admin'),
      );
      const policy = registry.getRoomPolicy('admin')!;
      expect(await policy(adminUser)).toBe(true);
      expect(await policy(regularUser)).toBe(false);
    });
  });
});
