import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { TokenService } from './token.service';

describe('TokenService', () => {
  let service: TokenService;
  let prisma: {
    user: { findUnique: jest.Mock };
    userSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };  let jwtService: {
    sign: jest.Mock;
    verify: jest.Mock;
  };

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return undefined;
    }),
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'JWT_ACCESS_EXPIRES_IN') return '15m';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '30d';
      return fallback;
    }),
  } as unknown as ConfigService;

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn() },
      userSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    jwtService = {
      sign: jest.fn(() => 'signed-token'),
      verify: jest.fn(),
    };
    service = new TokenService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService,
    );
    prisma.user.findUnique.mockResolvedValue({
      status: UserStatus.ACTIVE,
      deletedAt: null,
    });
  });

  describe('createSession', () => {
    it('stores a SHA-256 hash of the refresh token, never the raw token', async () => {
      jwtService.sign.mockImplementation(
        (payload: { type: string }) => `raw.${payload.type}`,
      );

      const tokens = await service.createSession('user-1', {
        deviceId: 'device-1',
        ipAddress: '1.2.3.4',
      });

      expect(tokens.accessToken).toBe('raw.access');
      expect(tokens.refreshToken).toBe('raw.refresh');

      const call = prisma.userSession.create.mock.calls[0][0];
      expect(call.data.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(call.data.refreshToken).not.toContain('raw.refresh');
      expect(call.data.userId).toBe('user-1');
      expect(call.data.deviceId).toBe('device-1');
      expect(call.data.ipAddress).toBe('1.2.3.4');
      expect(call.data.id).toBeDefined();
      expect(call.data.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 29 * 86_400_000,
      );
    });
  });

  describe('refreshSession', () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      refreshToken: 'stored-hash',
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
    };

    it('rotates the session with a new hash and returns a new token pair', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);
      prisma.userSession.updateMany.mockResolvedValue({ count: 1 });
      jwtService.sign.mockImplementation(
        (payload: { type: string }) => `new.${payload.type}`,
      );

      const tokens = await service.refreshSession('raw.refresh');

      expect(tokens.accessToken).toBe('new.access');
      expect(tokens.refreshToken).toBe('new.refresh');

      const findCall = prisma.userSession.findUnique.mock.calls[0][0];
      expect(findCall.where.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(findCall.where.refreshToken).not.toBe('raw.refresh');

      const updateCall = prisma.userSession.updateMany.mock.calls[0][0];
      expect(updateCall.where.id).toBe('session-1');
      expect(updateCall.where.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(updateCall.where.revokedAt).toBeNull();
      expect(updateCall.data.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(updateCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('throws when rotation loses the race (token already rotated)', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);
      prisma.userSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws UnauthorizedException when the refresh token is invalid or expired', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.userSession.findUnique).not.toHaveBeenCalled();
    });

    it('throws when a refresh token is used with a non-refresh payload type', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'access',
      });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the session is not found', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(null);

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
    });

    it('throws when the session is revoked', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        ...session,
        revokedAt: new Date(),
      });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the session has expired', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue({
        ...session,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws when the session belongs to a different user', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-2',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it.each([
      ['suspended', UserStatus.SUSPENDED],
      ['locked', UserStatus.LOCKED],
    ])('throws and does not rotate when the user is %s', async (_label, status) => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);
      prisma.user.findUnique.mockResolvedValue({
        status,
        deletedAt: null,
      });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { status: true, deletedAt: true },
      });
      expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
    });

    it('throws and does not rotate when the user is soft-deleted', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);
      prisma.user.findUnique.mockResolvedValue({
        status: UserStatus.ACTIVE,
        deletedAt: new Date(),
      });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: { status: true, deletedAt: true },
      });
      expect(prisma.userSession.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('revokeSession', () => {
    it('marks the session as revoked', async () => {
      await service.revokeSession('session-1');

      const call = prisma.userSession.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'session-1', revokedAt: null });
      expect(call.data.revokedAt).toBeInstanceOf(Date);
    });
  });
});
