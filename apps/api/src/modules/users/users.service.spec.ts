import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AppRole } from '../auth/enums/app-role.enum';
import { UsersService } from './users.service';

const now = new Date('2026-08-16T00:00:00.000Z');

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
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      user: {
        count: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((operation: unknown) =>
      Promise.all(operation as Promise<unknown>[]),
    );
    service = new UsersService(prisma as unknown as PrismaService);
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
});