import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AppRole } from '../auth/enums/app-role.enum';
import { RolesService } from '../auth/roles/roles.service';
import { UsersService } from './users.service';

const now = new Date('2026-08-16T00:00:00.000Z');

function makeLifecycleTarget(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    status: 'ACTIVE',
    deletedAt: null,
    roles: [{ role: { name: 'CUSTOMER' } }],
    ...overrides,
  };
}

function makeActorRow(roles: AppRole[] = [AppRole.ADMIN]) {
  return { roles: roles.map((name) => ({ role: { name } })) };
}

function makeListRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    mobile: '+989123456789',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    profile: { firstName: 'علی', lastName: 'احمدی', partner: null },
    roles: [{ role: { name: 'CUSTOMER' } }],
    ...overrides,
  };
}

function makeDetailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    mobile: '+989123456789',
    email: null,
    status: 'ACTIVE',
    lastLoginAt: new Date('2026-08-15T00:00:00.000Z'),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    profile: { firstName: 'علی', lastName: 'احمدی', partner: null },
    roles: [
      {
        role: { name: 'CUSTOMER' },
        assignedAt: new Date('2026-08-14T00:00:00.000Z'),
      },
    ],
    ...overrides,
  };
}

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      count: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
    };
    role: {
      findMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let rolesService: { findRoleIdByName: jest.Mock };
  let audit: { log: jest.Mock };
  let tx: {
    user: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    userSession: {
      updateMany: jest.Mock;
    };
    userRole: {
      upsert: jest.Mock;
      deleteMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      user: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      userSession: {
        updateMany: jest.fn(),
      },
      userRole: {
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    prisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      role: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((operation: unknown) => {
      if (typeof operation === 'function') {
        return (operation as (client: unknown) => unknown)(tx);
      }
      return Promise.all(operation as Promise<unknown>[]);
    });
    rolesService = { findRoleIdByName: jest.fn() };
    audit = { log: jest.fn() };
    service = new UsersService(
      prisma as unknown as PrismaService,
      audit as unknown as AuditService,
      rolesService as unknown as RolesService,
    );
  });

  describe('list', () => {
    it('defaults to page 1, limit 20 and always excludes soft-deleted users', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([makeListRow()]);

      const result = await service.list({});

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        select: expect.any(Object),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 20,
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.items[0]!.id).toBe('user-1');
    });

    it('honours explicit page and limit', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ page: 3, limit: 10 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deletedAt: null },
          skip: 20,
          take: 10,
        }),
      );
    });

    it('builds an OR search across mobile, first name and last name', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ search: 'علی' });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [
            { mobile: { contains: 'علی', mode: 'insensitive' } },
            {
              profile: {
                firstName: { contains: 'علی', mode: 'insensitive' },
              },
            },
            {
              profile: {
                lastName: { contains: 'علی', mode: 'insensitive' },
              },
            },
          ],
        },
      });
    });

    it('omits an empty or whitespace search', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ search: '   ' });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { deletedAt: null },
      });
    });

    it('escapes LIKE wildcards in the search term', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ search: 'میر_احمدی 100%' });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          OR: [
            {
              mobile: {
                contains: 'میر\\_احمدی 100\\%',
                mode: 'insensitive',
              },
            },
            {
              profile: {
                firstName: {
                  contains: 'میر\\_احمدی 100\\%',
                  mode: 'insensitive',
                },
              },
            },
            {
              profile: {
                lastName: {
                  contains: 'میر\\_احمدی 100\\%',
                  mode: 'insensitive',
                },
              },
            },
          ],
        },
      });
    });

    it('filters by status', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ status: 'SUSPENDED' });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: { deletedAt: null, status: 'SUSPENDED' },
      });
    });

    it('filters by role through the UserRole relation', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ role: AppRole.OPERATOR });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          roles: { some: { role: { name: AppRole.OPERATOR } } },
        },
      });
    });

    it('combines search, status and role filters', async () => {
      prisma.user.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({
        search: 'احمدی',
        status: 'ACTIVE',
        role: AppRole.PARTNER,
      });

      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          status: 'ACTIVE',
          roles: { some: { role: { name: AppRole.PARTNER } } },
          OR: [
            { mobile: { contains: 'احمدی', mode: 'insensitive' } },
            {
              profile: {
                firstName: { contains: 'احمدی', mode: 'insensitive' },
              },
            },
            {
              profile: {
                lastName: { contains: 'احمدی', mode: 'insensitive' },
              },
            },
          ],
        },
      });
    });

    it('maps list rows to the summary shape including partner and roles', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([
        makeListRow({
          roles: [
            { role: { name: 'CUSTOMER' } },
            { role: { name: 'PARTNER' } },
          ],
          profile: {
            firstName: 'علی',
            lastName: 'احمدی',
            partner: {
              id: 'partner-1',
              businessName: 'اکسیر الکترونیک',
              approvalStatus: 'APPROVED',
            },
          },
        }),
      ]);

      const result = await service.list({});

      expect(result.items[0]).toEqual({
        id: 'user-1',
        mobile: '+989123456789',
        status: 'ACTIVE',
        profile: { firstName: 'علی', lastName: 'احمدی' },
        roles: ['CUSTOMER', 'PARTNER'],
        partner: {
          id: 'partner-1',
          businessName: 'اکسیر الکترونیک',
          approvalStatus: 'APPROVED',
        },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    });

    it('never returns sensitive fields in the list payload', async () => {
      prisma.user.count.mockResolvedValue(1);
      prisma.user.findMany.mockResolvedValue([makeListRow()]);

      const result = await service.list({});
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('getDetail', () => {
    it('returns the full detail for an existing user', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeDetailRow({
          email: 'ali@example.com',
          profile: {
            firstName: 'علی',
            lastName: 'احمدی',
            partner: {
              id: 'partner-1',
              businessName: 'اکسیر الکترونیک',
              approvalStatus: 'APPROVED',
            },
          },
        }),
      );

      const result = await service.getDetail('user-1');

      expect(result).toEqual({
        id: 'user-1',
        mobile: '+989123456789',
        email: 'ali@example.com',
        status: 'ACTIVE',
        profile: { firstName: 'علی', lastName: 'احمدی' },
        roles: [
          { name: 'CUSTOMER', assignedAt: '2026-08-14T00:00:00.000Z' },
        ],
        partner: {
          id: 'partner-1',
          businessName: 'اکسیر الکترونیک',
          approvalStatus: 'APPROVED',
        },
        lastLoginAt: '2026-08-15T00:00:00.000Z',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: expect.objectContaining({
          id: true,
          email: true,
          lastLoginAt: true,
          deletedAt: true,
        }),
      });
    });

    it('returns null partner and lastLoginAt for a plain customer', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeDetailRow({ lastLoginAt: null }),
      );

      const result = await service.getDetail('user-1');

      expect(result.partner).toBeNull();
      expect(result.lastLoginAt).toBeNull();
    });

    it('throws 404 when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getDetail('user-missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws 404 for a soft-deleted user', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeDetailRow({ deletedAt: new Date('2026-08-16T01:00:00.000Z') }),
      );

      await expect(service.getDetail('user-deleted')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('never selects passwordHash, sessions or audit records', async () => {
      prisma.user.findUnique.mockResolvedValue(makeDetailRow());

      await service.getDetail('user-1');

      const select = prisma.user.findUnique.mock.calls[0]![0].select;
      expect(select.passwordHash).toBeUndefined();
      expect(select.sessions).toBeUndefined();
      expect(select.auditLog).toBeUndefined();
    });

    it('never returns sensitive fields in the detail payload', async () => {
      prisma.user.findUnique.mockResolvedValue(makeDetailRow());

      const result = await service.getDetail('user-1');
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('suspendUser', () => {
    function expectSuspendedDetailCalls() {
      prisma.user.findUnique.mockResolvedValue(
        makeDetailRow({ status: 'SUSPENDED' }),
      );
    }

    it('transitions ACTIVE → SUSPENDED, revokes sessions and audits in one transaction', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.userSession.updateMany.mockResolvedValue({ count: 2 });
      expectSuspendedDetailCalls();

      const result = await service.suspendUser(
        'user-1',
        'actor-1',
        { reason: 'تخلف در فروش' },
        '1.2.3.4',
      );

      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', status: 'ACTIVE', deletedAt: null },
        data: { status: 'SUSPENDED', updatedBy: 'actor-1' },
      });
      expect(tx.userSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          action: 'USER_SUSPENDED',
          entity: 'User',
          entityId: 'user-1',
          before: { status: 'ACTIVE' },
          after: { status: 'SUSPENDED', reason: 'تخلف در فروش' },
          ipAddress: '1.2.3.4',
        }),
        tx,
      );
      expect(result.status).toBe('SUSPENDED');
      expect(tx.$queryRaw).not.toHaveBeenCalled();
    });

    it('omits the reason from the audit when not provided', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.userSession.updateMany.mockResolvedValue({ count: 0 });
      prisma.user.findUnique.mockResolvedValue(
        makeDetailRow({ status: 'SUSPENDED' }),
      );

      await service.suspendUser('user-1', 'actor-1', {});

      const entry = audit.log.mock.calls[0]![0] as {
        after: Record<string, unknown>;
      };
      expect(entry.after).toEqual({ status: 'SUSPENDED' });
    });

    it('rejects a SUSPENDED target with 409', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ status: 'SUSPENDED' }),
      );

      await expect(
        service.suspendUser('user-1', 'actor-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a LOCKED target with 409', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ status: 'LOCKED' }),
      );

      await expect(
        service.suspendUser('user-1', 'actor-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a PENDING_OTP target with 409', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ status: 'PENDING_OTP' }),
      );

      await expect(
        service.suspendUser('user-1', 'actor-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('forbids self-suspension with 409', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());

      await expect(
        service.suspendUser('user-1', 'user-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a missing target with 404', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.suspendUser('user-missing', 'actor-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a soft-deleted target with 404', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ deletedAt: now }),
      );

      await expect(
        service.suspendUser('user-deleted', 'actor-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('denies an OPERATOR acting on an ADMIN target with 403', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(
          makeLifecycleTarget({ roles: [{ role: { name: 'ADMIN' } }] }),
        )
        .mockResolvedValueOnce(makeActorRow([AppRole.OPERATOR]));

      await expect(
        service.suspendUser('user-1', 'actor-1', {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an ADMIN acting on an ADMIN target', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(
          makeLifecycleTarget({ roles: [{ role: { name: 'ADMIN' } }] }),
        )
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.userSession.updateMany.mockResolvedValue({ count: 0 });
      tx.$queryRaw.mockResolvedValue([
        { id: 'other-admin' },
        { id: 'user-1' },
      ]);
      prisma.user.findUnique.mockResolvedValue(
        makeDetailRow({ status: 'SUSPENDED' }),
      );

      const result = await service.suspendUser('user-1', 'actor-1', {});

      expect(tx.$queryRaw).toHaveBeenCalled();
      expect(result.status).toBe('SUSPENDED');
    });

    it('blocks suspension of the last active ADMIN with 409', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(
          makeLifecycleTarget({ roles: [{ role: { name: 'ADMIN' } }] }),
        )
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));
      tx.$queryRaw.mockResolvedValue([{ id: 'user-1' }]);

      await expect(
        service.suspendUser('user-1', 'actor-1', {}),
      ).rejects.toThrow(ConflictException);
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('returns 409 when a concurrent mutation wins the state gate', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.suspendUser('user-1', 'actor-1', {}),
      ).rejects.toThrow(ConflictException);
    });

    it('never writes sensitive data into the audit payload', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      tx.userSession.updateMany.mockResolvedValue({ count: 0 });
      prisma.user.findUnique.mockResolvedValue(
        makeDetailRow({ status: 'SUSPENDED' }),
      );

      await service.suspendUser('user-1', 'actor-1', {});

      const serialized = JSON.stringify(audit.log.mock.calls[0]);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('unsuspendUser', () => {
    it('transitions SUSPENDED → ACTIVE and audits without touching sessions', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ status: 'SUSPENDED' }),
      );
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue(makeDetailRow());

      const result = await service.unsuspendUser('user-1', 'actor-1', '1.2.3.4');

      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', status: 'SUSPENDED', deletedAt: null },
        data: { status: 'ACTIVE', updatedBy: 'actor-1' },
      });
      expect(tx.userSession.updateMany).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          action: 'USER_UNSUSPENDED',
          entity: 'User',
          entityId: 'user-1',
          before: { status: 'SUSPENDED' },
          after: { status: 'ACTIVE' },
          ipAddress: '1.2.3.4',
        }),
        tx,
      );
      expect(result.status).toBe('ACTIVE');
    });

    it('rejects an ACTIVE target with 409', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());

      await expect(
        service.unsuspendUser('user-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a LOCKED target with 409', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ status: 'LOCKED' }),
      );

      await expect(
        service.unsuspendUser('user-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('denies an OPERATOR acting on an ADMIN target with 403', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(
          makeLifecycleTarget({
            status: 'SUSPENDED',
            roles: [{ role: { name: 'ADMIN' } }],
          }),
        )
        .mockResolvedValueOnce(makeActorRow([AppRole.OPERATOR]));

      await expect(
        service.unsuspendUser('user-1', 'actor-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a missing target with 404', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.unsuspendUser('user-missing', 'actor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 409 when a concurrent mutation wins the state gate', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ status: 'SUSPENDED' }),
      );
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.unsuspendUser('user-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('unlockUser', () => {
    function unlockTarget() {
      return makeLifecycleTarget({ status: 'LOCKED' });
    }

    function mockUnlockCall(target: ReturnType<typeof unlockTarget>) {
      tx.user.findUnique
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));
    }

    it('transitions LOCKED → ACTIVE and audits without touching sessions', async () => {
      mockUnlockCall(unlockTarget());
      tx.user.updateMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue(makeDetailRow());

      const result = await service.unlockUser('user-1', 'actor-1', '1.2.3.4');

      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', status: 'LOCKED', deletedAt: null },
        data: { status: 'ACTIVE', updatedBy: 'actor-1' },
      });
      expect(tx.userSession.updateMany).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          action: 'USER_UNLOCKED',
          entity: 'User',
          entityId: 'user-1',
          before: { status: 'LOCKED' },
          after: { status: 'ACTIVE' },
          ipAddress: '1.2.3.4',
        }),
        tx,
      );
      expect(result.status).toBe('ACTIVE');
    });

    it('rejects an ACTIVE target with 409', async () => {
      mockUnlockCall(makeLifecycleTarget());

      await expect(
        service.unlockUser('user-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a SUSPENDED target with 409', async () => {
      mockUnlockCall(makeLifecycleTarget({ status: 'SUSPENDED' }));

      await expect(
        service.unlockUser('user-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a non-ADMIN actor with 403', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(unlockTarget())
        .mockResolvedValueOnce(makeActorRow([AppRole.OPERATOR]));

      await expect(
        service.unlockUser('user-1', 'actor-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a missing target with 404', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.unlockUser('user-missing', 'actor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 409 when a concurrent mutation wins the state gate', async () => {
      mockUnlockCall(unlockTarget());
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.unlockUser('user-1', 'actor-1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listRoles', () => {
    it('maps role rows to summaries with read-only permission names', async () => {
      prisma.role.findMany.mockResolvedValue([
        {
          id: 'role-admin',
          name: 'ADMIN',
          description: 'Super administrator',
          permissions: [{ permission: { name: 'users.assign' } }],
        },
        {
          id: 'role-customer',
          name: 'CUSTOMER',
          description: null,
          permissions: [],
        },
      ]);

      const result = await service.listRoles();

      expect(result).toEqual([
        {
          id: 'role-admin',
          name: 'ADMIN',
          description: 'Super administrator',
          permissions: ['users.assign'],
        },
        {
          id: 'role-customer',
          name: 'CUSTOMER',
          description: null,
          permissions: [],
        },
      ]);
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ name: 'asc' }],
        }),
      );
    });

    it('returns an empty list when no roles are seeded', async () => {
      prisma.role.findMany.mockResolvedValue([]);

      await expect(service.listRoles()).resolves.toEqual([]);
    });
  });

  describe('assignRole', () => {
    function mockAssignCall(target: ReturnType<typeof makeLifecycleTarget>) {
      tx.user.findUnique
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));
      rolesService.findRoleIdByName.mockResolvedValue('role-id');
      tx.userRole.upsert.mockImplementation(
        async (args: { create: { assignedAt: Date } }) => ({
          assignedAt: args.create.assignedAt,
        }),
      );
      prisma.user.findUnique.mockResolvedValue(makeDetailRow());
    }

    it('assigns the role via upsert and writes ROLE_ASSIGNED in the same transaction', async () => {
      mockAssignCall(makeLifecycleTarget());

      const result = await service.assignRole(
        'user-1',
        AppRole.OPERATOR,
        'actor-1',
        '1.2.3.4',
      );

      expect(tx.userRole.upsert).toHaveBeenCalledWith({
        where: {
          userId_roleId: { userId: 'user-1', roleId: 'role-id' },
        },
        create: expect.objectContaining({
          userId: 'user-1',
          roleId: 'role-id',
          assignedBy: 'actor-1',
        }),
        update: {},
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          action: 'ROLE_ASSIGNED',
          entity: 'UserRole',
          entityId: 'user-1',
          before: { role: null },
          after: { role: AppRole.OPERATOR },
          ipAddress: '1.2.3.4',
        }),
        tx,
      );
      expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
    });

    it('treats an existing assignment as a no-op with no audit', async () => {
      mockAssignCall(makeLifecycleTarget());
      tx.userRole.upsert.mockResolvedValue({
        assignedAt: new Date('2026-01-01T00:00:00.000Z'),
      });

      const result = await service.assignRole(
        'user-1',
        AppRole.OPERATOR,
        'actor-1',
      );

      expect(audit.log).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
    });

    it('treats a concurrent duplicate assignment (P2002) as a no-op with no audit', async () => {
      mockAssignCall(makeLifecycleTarget());
      tx.userRole.upsert.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError(
          'Unique constraint failed on the fields: (`userId`,`roleId`)',
          {
            code: 'P2002',
            clientVersion: 'test',
            meta: { modelName: 'UserRole', target: ['userId', 'roleId'] },
          },
        ),
      );

      const result = await service.assignRole(
        'user-1',
        AppRole.OPERATOR,
        'actor-1',
      );

      expect(audit.log).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
    });

    it('propagates non-unique database errors', async () => {
      mockAssignCall(makeLifecycleTarget());
      tx.userRole.upsert.mockRejectedValue(new Error('connection lost'));

      await expect(
        service.assignRole('user-1', AppRole.OPERATOR, 'actor-1'),
      ).rejects.toThrow('connection lost');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('assigns an ADMIN role to another user and audits it', async () => {
      mockAssignCall(makeLifecycleTarget());

      await service.assignRole('user-1', AppRole.ADMIN, 'actor-1');

      const entry = audit.log.mock.calls[0]![0] as {
        action: string;
        after: Record<string, unknown>;
      };
      expect(entry.action).toBe('ROLE_ASSIGNED');
      expect(entry.after).toEqual({ role: AppRole.ADMIN });
    });

    it('only touches the given role and preserves existing roles', async () => {
      mockAssignCall(
        makeLifecycleTarget({
          roles: [{ role: { name: 'CUSTOMER' } }, { role: { name: 'PARTNER' } }],
        }),
      );

      await service.assignRole('user-1', AppRole.OPERATOR, 'actor-1');

      expect(tx.userRole.upsert).toHaveBeenCalledTimes(1);
      expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
      expect(tx.userRole.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_roleId: { userId: 'user-1', roleId: 'role-id' },
          },
        }),
      );
    });

    it('rejects a missing target with 404', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.assignRole('user-missing', AppRole.OPERATOR, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
      expect(tx.userRole.upsert).not.toHaveBeenCalled();
    });

    it('rejects a soft-deleted target with 404', async () => {
      tx.user.findUnique.mockResolvedValue(
        makeLifecycleTarget({ deletedAt: now }),
      );

      await expect(
        service.assignRole('user-deleted', AppRole.OPERATOR, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids modifying your own roles with 403', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());

      await expect(
        service.assignRole('user-1', AppRole.OPERATOR, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.userRole.upsert).not.toHaveBeenCalled();
    });

    it('rejects a non-ADMIN actor with 403', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(makeLifecycleTarget())
        .mockResolvedValueOnce(makeActorRow([AppRole.OPERATOR]));

      await expect(
        service.assignRole('user-1', AppRole.OPERATOR, 'actor-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.userRole.upsert).not.toHaveBeenCalled();
    });

    it('returns 404 when the role row is missing', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(makeLifecycleTarget())
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));
      rolesService.findRoleIdByName.mockResolvedValue(null);

      await expect(
        service.assignRole('user-1', AppRole.OPERATOR, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
      expect(tx.userRole.upsert).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('never writes sensitive data into the audit payload', async () => {
      mockAssignCall(makeLifecycleTarget());

      await service.assignRole('user-1', AppRole.OPERATOR, 'actor-1');

      const serialized = JSON.stringify(audit.log.mock.calls);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('removeRole', () => {
    function mockRemoveCall(target: ReturnType<typeof makeLifecycleTarget>) {
      tx.user.findUnique
        .mockResolvedValueOnce(target)
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));
      rolesService.findRoleIdByName.mockResolvedValue('role-id');
      tx.userRole.deleteMany.mockResolvedValue({ count: 1 });
      prisma.user.findUnique.mockResolvedValue(makeDetailRow());
    }

    it('removes the role and writes ROLE_REMOVED in the same transaction', async () => {
      mockRemoveCall(
        makeLifecycleTarget({ roles: [{ role: { name: 'OPERATOR' } }] }),
      );

      const result = await service.removeRole(
        'user-1',
        AppRole.OPERATOR,
        'actor-1',
        '1.2.3.4',
      );

      expect(tx.userRole.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', roleId: 'role-id' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'actor-1',
          action: 'ROLE_REMOVED',
          entity: 'UserRole',
          entityId: 'user-1',
          before: { role: AppRole.OPERATOR },
          after: { role: null },
          ipAddress: '1.2.3.4',
        }),
        tx,
      );
      expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
    });

    it('treats removing an already-absent role as a no-op with no audit', async () => {
      mockRemoveCall(makeLifecycleTarget());
      tx.userRole.deleteMany.mockResolvedValue({ count: 0 });

      const result = await service.removeRole(
        'user-1',
        AppRole.OPERATOR,
        'actor-1',
      );

      expect(audit.log).not.toHaveBeenCalled();
      expect(result).toEqual(expect.objectContaining({ id: 'user-1' }));
    });

    it('forbids ADMIN-role removal with 403', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(
          makeLifecycleTarget({ roles: [{ role: { name: 'ADMIN' } }] }),
        )
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));

      await expect(
        service.removeRole('user-1', AppRole.ADMIN, 'actor-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('forbids removing your own roles with 403', async () => {
      tx.user.findUnique.mockResolvedValue(makeLifecycleTarget());

      await expect(
        service.removeRole('user-1', AppRole.OPERATOR, 'user-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
    });

    it('rejects a missing target with 404', async () => {
      tx.user.findUnique.mockResolvedValue(null);

      await expect(
        service.removeRole('user-missing', AppRole.OPERATOR, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns 404 when the role row is missing', async () => {
      tx.user.findUnique
        .mockResolvedValueOnce(makeLifecycleTarget())
        .mockResolvedValueOnce(makeActorRow([AppRole.ADMIN]));
      rolesService.findRoleIdByName.mockResolvedValue(null);

      await expect(
        service.removeRole('user-1', AppRole.OPERATOR, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
      expect(tx.userRole.deleteMany).not.toHaveBeenCalled();
    });
  });
});