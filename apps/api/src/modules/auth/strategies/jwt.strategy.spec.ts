import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserStatus } from '@prisma/client';
import { AuthService } from '../auth.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let authService: { findUserById: jest.Mock };

  const configService = {
    getOrThrow: jest.fn(() => 'access-secret'),
  } as unknown as ConfigService;

  beforeEach(() => {
    authService = { findUserById: jest.fn() };
    strategy = new JwtStrategy(
      configService,
      authService as unknown as AuthService,
    );
  });

  it('returns the AuthUser for an active user with an access payload', async () => {
    authService.findUserById.mockResolvedValue({
      id: 'user-1',
      mobile: '+989123456789',
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });

    const result = await strategy.validate({
      sub: 'user-1',
      sessionId: 'session-1',
      type: 'access',
    });

    expect(result).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
      mobile: '+989123456789',
    });
  });

  it('rejects non-access payloads', async () => {
    await expect(
      strategy.validate({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects when the user does not exist', async () => {
    authService.findUserById.mockResolvedValue(null);

    await expect(
      strategy.validate({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'access',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects suspended users', async () => {
    authService.findUserById.mockResolvedValue({
      id: 'user-1',
      mobile: '+989123456789',
      status: UserStatus.SUSPENDED,
      deletedAt: null,
    });

    await expect(
      strategy.validate({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'access',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects soft-deleted users', async () => {
    authService.findUserById.mockResolvedValue({
      id: 'user-1',
      mobile: '+989123456789',
      status: UserStatus.ACTIVE,
      deletedAt: new Date(),
    });

    await expect(
      strategy.validate({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'access',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
