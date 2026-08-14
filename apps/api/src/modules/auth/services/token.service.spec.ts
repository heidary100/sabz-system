import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../../common/database/prisma.service';
import { AuditService } from '../../audit/audit.service';
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
    $transaction: jest.Mock;
  };
  let tx: {
    userSession: { create: jest.Mock; updateMany: jest.Mock };
  };
  let auditService: { log: jest.Mock };
  let jwtService: {
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
    tx = {
      userSession: {
        create: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    prisma = {
      user: { findUnique: jest.fn() },
      userSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    auditService = { log: jest.fn() };
    jwtService = {
      sign: jest.fn(() => 'signed-token'),
      verify: jest.fn(),
    };
    service = new TokenService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService,
      auditService as unknown as AuditService,
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

      const call = tx.userSession.create.mock.calls[0][0];
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

    it('audit logs SESSION_CREATED inside the session transaction', async () => {
      jwtService.sign.mockImplementation(
        (payload: { type: string }) => `raw.${payload.type}`,
      );

      await service.createSession('user-1', {
        deviceId: 'device-1',
        ipAddress: '1.2.3.4',
      });

      const sessionId = tx.userSession.create.mock.calls[0][0].data.id;
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          action: 'SESSION_CREATED',
          entity: 'UserSession',
          entityId: sessionId,
          ipAddress: '1.2.3.4',
        },
        tx,
      );
      const serialized = JSON.stringify(auditService.log.mock.calls[0][0]);
      expect(serialized).not.toContain('raw.refresh');
      expect(serialized).not.toContain('raw.access');
      expect(serialized).not.toMatch(/[a-f0-9]{64}/);
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
      tx.userSession.updateMany.mockResolvedValue({ count: 1 });
      jwtService.sign.mockImplementation(
        (payload: { type: string }) => `new.${payload.type}`,
      );

      const tokens = await service.refreshSession('raw.refresh');

      expect(tokens.accessToken).toBe('new.access');
      expect(tokens.refreshToken).toBe('new.refresh');

      const findCall = prisma.userSession.findUnique.mock.calls[0][0];
      expect(findCall.where.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(findCall.where.refreshToken).not.toBe('raw.refresh');

      const updateCall = tx.userSession.updateMany.mock.calls[0][0];
      expect(updateCall.where.id).toBe('session-1');
      expect(updateCall.where.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(updateCall.where.revokedAt).toBeNull();
      expect(updateCall.data.refreshToken).toMatch(/^[a-f0-9]{64}$/);
      expect(updateCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('audit logs SESSION_REFRESHED inside the rotation transaction', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);
      tx.userSession.updateMany.mockResolvedValue({ count: 1 });

      await service.refreshSession('raw.refresh', { ipAddress: '1.2.3.4' });

      expect(auditService.log).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          action: 'SESSION_REFRESHED',
          entity: 'UserSession',
          entityId: 'session-1',
          ipAddress: '1.2.3.4',
        },
        tx,
      );
      const serialized = JSON.stringify(auditService.log.mock.calls[0][0]);
      expect(serialized).not.toContain('raw.refresh');
      expect(serialized).not.toMatch(/[a-f0-9]{64}/);
    });

    it('audit logs no SESSION_REFRESHED event when rotation loses the race', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);
      tx.userSession.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'AUTHENTICATION_FAILED',
          entityId: 'session-1',
          after: { reason: 'TOKEN_REUSE' },
        }),
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
      expect(auditService.log).not.toHaveBeenCalled();
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
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('audit logs AUTHENTICATION_FAILED with a SESSION_NOT_FOUND reason when the session is missing', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-1',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(null);

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'AUTHENTICATION_FAILED',
          entityId: 'session-1',
          after: { reason: 'SESSION_NOT_FOUND' },
        }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('audit logs AUTHENTICATION_FAILED with a SESSION_REVOKED reason when the session is revoked', async () => {
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
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'AUTHENTICATION_FAILED',
          entityId: 'session-1',
          after: { reason: 'SESSION_REVOKED' },
        }),
      );
    });

    it('does not audit when the session has naturally expired', async () => {
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
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('audit logs AUTHENTICATION_FAILED with a USER_MISMATCH reason when the session belongs to another user', async () => {
      jwtService.verify.mockReturnValue({
        sub: 'user-2',
        sessionId: 'session-1',
        type: 'refresh',
      });
      prisma.userSession.findUnique.mockResolvedValue(session);

      await expect(service.refreshSession('raw.refresh')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          action: 'AUTHENTICATION_FAILED',
          entityId: 'session-1',
          after: { reason: 'USER_MISMATCH' },
        }),
      );
    });

    it.each([
      ['suspended', UserStatus.SUSPENDED],
      ['locked', UserStatus.LOCKED],
    ])(
      'audit logs AUTHENTICATION_FAILED and does not rotate when the user is %s',
      async (_label, status) => {
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
        expect(tx.userSession.updateMany).not.toHaveBeenCalled();
        expect(auditService.log).toHaveBeenCalledWith(
          expect.objectContaining({
            userId: 'user-1',
            action: 'AUTHENTICATION_FAILED',
            entityId: 'session-1',
            after: { reason: 'ACCOUNT_NOT_ACTIVE' },
          }),
        );
      },
    );

    it('audit logs AUTHENTICATION_FAILED and does not rotate when the user is soft-deleted', async () => {
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
      expect(tx.userSession.updateMany).not.toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'AUTHENTICATION_FAILED',
          after: { reason: 'ACCOUNT_NOT_ACTIVE' },
        }),
      );
    });

    it('never changes the response when the failure audit cannot be written', async () => {
      auditService.log.mockRejectedValue(new Error('audit db down'));
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
  });

  describe('revokeSession', () => {
    it('marks the session as revoked and audit logs SESSION_REVOKED inside the transaction', async () => {
      tx.userSession.updateMany.mockResolvedValue({ count: 1 });

      await service.revokeSession('session-1', {
        userId: 'user-1',
        ipAddress: '1.2.3.4',
      });

      const call = tx.userSession.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'session-1', revokedAt: null });
      expect(call.data.revokedAt).toBeInstanceOf(Date);
      expect(auditService.log).toHaveBeenCalledWith(
        {
          userId: 'user-1',
          action: 'SESSION_REVOKED',
          entity: 'UserSession',
          entityId: 'session-1',
          ipAddress: '1.2.3.4',
        },
        tx,
      );
      const serialized = JSON.stringify(auditService.log.mock.calls[0][0]);
      expect(serialized).not.toMatch(/[a-f0-9]{64}/);
    });

    it('does not audit a repeated logout of an already-revoked session', async () => {
      tx.userSession.updateMany.mockResolvedValue({ count: 0 });

      await service.revokeSession('session-1', { userId: 'user-1' });

      expect(auditService.log).not.toHaveBeenCalled();
    });
  });
});
