import { ForbiddenException } from '@nestjs/common';
import { Prisma, User, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let tx: {
    user: { update: jest.Mock };
  };
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    tx = {
      user: { update: jest.fn() },
    };
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (client: typeof tx) => unknown) => callback(tx),
    );
    auditService = { log: jest.fn() };
    service = new AuthService(
      prisma as unknown as PrismaService,
      auditService as unknown as AuditService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a user when a matching mobile is found', async () => {
    const user = { id: 'uuid', mobile: '+989123456789' };
    prisma.user.findUnique.mockResolvedValue(user);

    const result = await service.findUserByMobile('+989123456789');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { mobile: '+989123456789', deletedAt: null },
    });
    expect(result).toEqual(user);
  });

  it('should return null when no user matches the mobile', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await service.findUserByMobile('+989000000000');

    expect(result).toBeNull();
  });

  describe('getOrCreateUserByMobile', () => {
    it('returns the existing user when one matches', async () => {
      const user = { id: 'uuid', mobile: '+989123456789' };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.getOrCreateUserByMobile('+989123456789');

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(result).toEqual(user);
    });

    it('creates a user when none matches', async () => {
      const user = { id: 'uuid', mobile: '+989123456789' };
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(user);

      const result = await service.getOrCreateUserByMobile('+989123456789');

      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { mobile: '+989123456789' },
      });
      expect(result).toEqual(user);
    });

    it('returns the racing user when a concurrent verification wins the race', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`mobile`)',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      const user = { id: 'uuid', mobile: '+989123456789' };
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValue(user);
      prisma.user.create.mockRejectedValue(p2002);

      const result = await service.getOrCreateUserByMobile('+989123456789');

      expect(result).toEqual(user);
    });

    it('throws ForbiddenException when a soft-deleted user owns the mobile', async () => {
      const p2002 = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`mobile`)',
        { code: 'P2002', clientVersion: '6.19.3' },
      );
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockRejectedValue(p2002);

      await expect(
        service.getOrCreateUserByMobile('+989123456789'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('markMobileVerified', () => {
    const baseUser: User = {
      id: 'uuid',
      mobile: '+989123456789',
      status: UserStatus.PENDING_OTP,
      email: null,
      passwordHash: null,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      createdBy: null,
      updatedBy: null,
    };

    it('returns the user unchanged when already active', async () => {
      const user = { ...baseUser, status: UserStatus.ACTIVE };

      const result = await service.markMobileVerified(user);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual(user);
    });

    it('updates a pending user to active', async () => {
      const verified = { ...baseUser, status: UserStatus.ACTIVE };
      tx.user.update.mockResolvedValue(verified);

      const result = await service.markMobileVerified(baseUser, '1.2.3.4');

      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'uuid', deletedAt: null },
        data: { status: UserStatus.ACTIVE },
      });
      expect(result).toEqual(verified);
    });

    it('audit logs ACCOUNT_ACTIVATED with before and after status inside the transaction', async () => {
      const verified = { ...baseUser, status: UserStatus.ACTIVE };
      tx.user.update.mockResolvedValue(verified);

      await service.markMobileVerified(baseUser, '1.2.3.4');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledWith(
        {
          userId: 'uuid',
          action: 'ACCOUNT_ACTIVATED',
          entity: 'User',
          entityId: 'uuid',
          before: { status: UserStatus.PENDING_OTP },
          after: { status: UserStatus.ACTIVE },
          ipAddress: '1.2.3.4',
        },
        tx,
      );
      const serialized = JSON.stringify(auditService.log.mock.calls[0][0]);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('mobile');
    });

    it('does not audit when the account is already active', async () => {
      const user = { ...baseUser, status: UserStatus.ACTIVE };

      const result = await service.markMobileVerified(user);

      expect(tx.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result).toEqual(user);
    });

    it('rejects suspended and locked accounts without auditing', async () => {
      const suspended = { ...baseUser, status: UserStatus.SUSPENDED };
      const locked = { ...baseUser, status: UserStatus.LOCKED };

      await expect(service.markMobileVerified(suspended)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.markMobileVerified(locked)).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rejects soft-deleted accounts without auditing', async () => {
      const deleted = { ...baseUser, deletedAt: new Date() };

      await expect(service.markMobileVerified(deleted)).rejects.toThrow(
        ForbiddenException,
      );
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rejects a pending user deleted after the initial lookup without auditing', async () => {
      const p2025 = new Prisma.PrismaClientKnownRequestError(
        'An operation failed because it depends on one or more records that were required but not found.',
        { code: 'P2025', clientVersion: '6.19.3' },
      );
      tx.user.update.mockRejectedValue(p2025);

      await expect(service.markMobileVerified(baseUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(auditService.log).not.toHaveBeenCalled();
    });
  });
});
