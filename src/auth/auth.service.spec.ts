import { jest } from '@jest/globals';
import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoggerService } from '../common/logger/logger.service.js';
import {
  SocialProvider,
  SOCIAL_PROVIDER,
} from './social/social-provider.port.js';

const mockLogger = {
  withContext: jest.fn().mockReturnThis(),
  log: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
};

class MockGoogleProvider extends SocialProvider {
  readonly id = 'google';
  readonly label = 'Google';
  readonly enabled = true;
}

async function buildModule(
  providers: SocialProvider[] = [],
): Promise<TestingModule> {
  return Test.createTestingModule({
    providers: [
      AuthService,
      { provide: PrismaService, useValue: {} },
      { provide: JwtService, useValue: {} },
      { provide: ConfigService, useValue: {} },
      { provide: LoggerService, useValue: mockLogger },
      { provide: SOCIAL_PROVIDER, useValue: providers },
    ],
  }).compile();
}

describe('AuthService.getAvailableMethods()', () => {
  it('returns only the password method when no social providers are registered', async () => {
    const module = await buildModule();
    const service = module.get(AuthService);

    expect(service.getAvailableMethods()).toEqual([
      { id: 'password', label: 'Email & Password', enabled: true },
    ]);
  });

  it('includes social providers when they are registered', async () => {
    const module = await buildModule([new MockGoogleProvider()]);
    const service = module.get(AuthService);
    const methods = service.getAvailableMethods();

    expect(methods).toHaveLength(2);
    expect(methods[1]).toEqual({
      id: 'google',
      label: 'Google',
      enabled: true,
    });
  });

  it('always lists password as the first method', async () => {
    const module = await buildModule([new MockGoogleProvider()]);
    const service = module.get(AuthService);

    expect(service.getAvailableMethods()[0].id).toBe('password');
  });
});
