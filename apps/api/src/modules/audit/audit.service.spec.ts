import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  let service: AuditService;
  let prisma: {
    auditLog: {
      create: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      auditLog: {
        create: jest.fn(),
      },
    };
    service = new AuditService(prisma as unknown as PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('persists an audit log entry', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

    await service.log({
      userId: 'user-1',
      action: 'PROFILE_UPDATE',
      entity: 'UserProfile',
      entityId: 'profile-1',
      before: { firstName: 'Ali' },
      after: { firstName: 'Reza' },
      ipAddress: '1.2.3.4',
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        action: 'PROFILE_UPDATE',
        entity: 'UserProfile',
        entityId: 'profile-1',
        before: { firstName: 'Ali' },
        after: { firstName: 'Reza' },
        ipAddress: '1.2.3.4',
      },
    });
  });
});

describe('AuditService.list (SS-064)', () => {
  let service: AuditService;
  let prisma: {
    $transaction: jest.Mock;
    auditLog: {
      create: jest.Mock;
      count: jest.Mock;
      findMany: jest.Mock;
    };
    user: {
      findMany: jest.Mock;
    };
  };

  function row(overrides: Record<string, unknown> = {}) {
    return {
      id: 'audit-1',
      userId: 'user-1',
      action: 'USER_SUSPENDED',
      entity: 'User',
      entityId: 'target-1',
      before: { status: 'ACTIVE' },
      after: { status: 'SUSPENDED' },
      ipAddress: '1.2.3.4',
      createdAt: new Date('2026-08-18T10:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      auditLog: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    };
    service = new AuditService(prisma as unknown as PrismaService);
  });

  it('applies default page and limit with an empty filter', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({});

    expect(prisma.auditLog.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 20,
    });
  });

  it('computes skip from page and limit', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({ page: 3, limit: 25 });

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 25 }),
    );
  });

  it('filters by actorId', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({ actorId: 'user-1' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('filters by action with exact equality', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({ action: 'ROLE_ASSIGNED' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { action: 'ROLE_ASSIGNED' },
    });
  });

  it('filters by entity with exact equality', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({ entity: 'Partner' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { entity: 'Partner' },
    });
  });

  it('filters by entityId', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({ entityId: 'partner-1' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { entityId: 'partner-1' },
    });
  });

  it('filters from as an inclusive lower bound', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({ from: '2026-08-18T00:00:00.000Z' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: new Date('2026-08-18T00:00:00.000Z'), lte: undefined } },
    });
  });

  it('filters to as an inclusive upper bound', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({ to: '2026-08-18T23:59:59.999Z' });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: { createdAt: { gte: undefined, lte: new Date('2026-08-18T23:59:59.999Z') } },
    });
  });

  it('combines multiple filters with AND', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);

    await service.list({
      actorId: 'user-1',
      action: 'USER_SUSPENDED',
      entity: 'User',
      entityId: 'target-1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-31T00:00:00.000Z',
    });

    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        action: 'USER_SUSPENDED',
        entity: 'User',
        entityId: 'target-1',
        createdAt: {
          gte: new Date('2026-08-01T00:00:00.000Z'),
          lte: new Date('2026-08-31T00:00:00.000Z'),
        },
      },
    });
  });

  it('rejects a from date later than the to date', async () => {
    await expect(
      service.list({ from: '2026-08-31T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects ISO dates that do not parse into a finite instant', async () => {
    await expect(service.list({ from: '2026-W07' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.list({ to: '2026-127' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns the total from the count and orders deterministically', async () => {
    prisma.$transaction.mockResolvedValue([3, []]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list({});

    expect(result.total).toBe(3);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('resolves the actor for an existing user', async () => {
    prisma.$transaction.mockResolvedValue([1, [row()]]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        mobile: '+989123456789',
        profile: { firstName: 'علی', lastName: 'احمدی' },
      },
    ]);

    const result = await service.list({});

    expect(result.items[0]!.actor).toEqual({
      id: 'user-1',
      mobile: '+989123456789',
      firstName: 'علی',
      lastName: 'احمدی',
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1'] } },
      select: {
        id: true,
        mobile: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
  });

  it('keeps userId and sets actor null when the actor row is missing', async () => {
    prisma.$transaction.mockResolvedValue([1, [row()]]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list({});

    expect(result.items[0]!.userId).toBe('user-1');
    expect(result.items[0]!.actor).toBeNull();
  });

  it('resolves a soft-deleted actor normally', async () => {
    prisma.$transaction.mockResolvedValue([1, [row()]]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        mobile: '+989123456789',
        profile: null,
      },
    ]);

    const result = await service.list({});

    expect(result.items[0]!.actor).toEqual({
      id: 'user-1',
      mobile: '+989123456789',
      firstName: null,
      lastName: null,
    });
  });

  it('returns actor null for rows without a userId (e.g. OTP events)', async () => {
    prisma.$transaction.mockResolvedValue([1, [row({ userId: null })]]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list({});

    expect(result.items[0]!.actor).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('maps ISO dates and nullable payload fields', async () => {
    prisma.$transaction.mockResolvedValue([
      1,
      [row({ entityId: null, before: null, after: null, ipAddress: null })],
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list({});

    expect(result.items[0]!.createdAt).toBe('2026-08-18T10:00:00.000Z');
    expect(result.items[0]!.entityId).toBeNull();
    expect(result.items[0]!.before).toBeNull();
    expect(result.items[0]!.after).toBeNull();
    expect(result.items[0]!.ipAddress).toBeNull();
  });

  it('treats non-object payloads as null instead of breaking the object contract', async () => {
    prisma.$transaction.mockResolvedValue([
      1,
      [row({ before: 'old', after: ['a', 'b'] })],
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.list({});

    expect(result.items[0]!.before).toBeNull();
    expect(result.items[0]!.after).toBeNull();
  });

  it('does not duplicate actor lookups for repeated userIds', async () => {
    prisma.$transaction.mockResolvedValue([2, [row(), row({ id: 'audit-2' })]]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        mobile: '+989123456789',
        profile: null,
      },
    ]);

    await service.list({});

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1'] } },
      select: {
        id: true,
        mobile: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
  });
});
