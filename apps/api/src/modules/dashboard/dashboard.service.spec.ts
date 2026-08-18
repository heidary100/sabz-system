import { PartnerApprovalStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/database/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService (SS-065)', () => {
  let service: DashboardService;
  let prisma: {
    $transaction: jest.Mock;
    user: { groupBy: jest.Mock; findMany: jest.Mock };
    role: { findMany: jest.Mock };
    partner: { groupBy: jest.Mock; findMany: jest.Mock };
    auditLog: { findMany: jest.Mock };
  };

  function userGroup(status: UserStatus, count: number) {
    return { status, _count: { _all: count } };
  }

  function partnerGroup(status: PartnerApprovalStatus, count: number) {
    return { approvalStatus: status, _count: { _all: count } };
  }

  function roleRow(name: string, users: number) {
    return { name, _count: { users } };
  }

  function partnerRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'partner-1',
      businessName: 'شرکت نمونه',
      approvalStatus: PartnerApprovalStatus.PENDING,
      city: 'تهران',
      province: 'تهران',
      submittedAt: new Date('2026-08-18T10:00:00.000Z'),
      createdAt: new Date('2026-08-18T09:00:00.000Z'),
      ...overrides,
    };
  }

  function auditRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'audit-1',
      userId: 'user-1',
      action: 'USER_SUSPENDED',
      entity: 'User',
      entityId: 'target-1',
      createdAt: new Date('2026-08-18T10:00:00.000Z'),
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(),
      user: { groupBy: jest.fn(), findMany: jest.fn() },
      role: { findMany: jest.fn() },
      partner: { groupBy: jest.fn(), findMany: jest.fn() },
      auditLog: { findMany: jest.fn() },
    };
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('returns zeroed counts and empty lists for an empty dataset', async () => {
    prisma.$transaction.mockResolvedValue([[], [], [], [], []]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(result.users).toEqual({
      total: 0,
      active: 0,
      suspended: 0,
      locked: 0,
      pendingOtp: 0,
    });
    expect(result.roles).toEqual({
      customer: 0,
      partner: 0,
      operator: 0,
      admin: 0,
    });
    expect(result.partners).toEqual({
      draft: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    });
    expect(result.recentPartners).toEqual([]);
    expect(result.recentAudit).toEqual([]);
  });

  it('maps user groupBy rows into status buckets and sums total', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        userGroup(UserStatus.ACTIVE, 4),
        userGroup(UserStatus.SUSPENDED, 2),
        userGroup(UserStatus.LOCKED, 1),
        userGroup(UserStatus.PENDING_OTP, 3),
      ],
      [],
      [],
      [],
      [],
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(prisma.user.groupBy).toHaveBeenCalledWith({
      by: ['status'],
      where: { deletedAt: null },
      orderBy: { status: 'asc' },
      _count: { _all: true },
    });
    expect(result.users).toEqual({
      total: 10,
      active: 4,
      suspended: 2,
      locked: 1,
      pendingOtp: 3,
    });
  });

  it('defaults missing user statuses to zero', async () => {
    prisma.$transaction.mockResolvedValue([
      [userGroup(UserStatus.ACTIVE, 2)],
      [],
      [],
      [],
      [],
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(result.users).toEqual({
      total: 2,
      active: 2,
      suspended: 0,
      locked: 0,
      pendingOtp: 0,
    });
  });

  it('maps role _count rows into the four role buckets', async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      [
        roleRow('CUSTOMER', 5),
        roleRow('PARTNER', 3),
        roleRow('OPERATOR', 2),
        roleRow('ADMIN', 1),
      ],
      [],
      [],
      [],
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(prisma.role.findMany).toHaveBeenCalledWith({
      where: { name: { in: ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN'] } },
      select: {
        name: true,
        _count: {
          select: {
            users: { where: { user: { deletedAt: null } } },
          },
        },
      },
    });
    expect(result.roles).toEqual({
      customer: 5,
      partner: 3,
      operator: 2,
      admin: 1,
    });
  });

  it('defaults missing role buckets to zero', async () => {
    prisma.$transaction.mockResolvedValue([[], [], [], [], []]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(result.roles).toEqual({
      customer: 0,
      partner: 0,
      operator: 0,
      admin: 0,
    });
  });

  it('maps partner groupBy rows into lifecycle buckets excluding soft-deleted partners', async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      [],
      [
        partnerGroup(PartnerApprovalStatus.DRAFT, 2),
        partnerGroup(PartnerApprovalStatus.PENDING, 4),
        partnerGroup(PartnerApprovalStatus.APPROVED, 1),
        partnerGroup(PartnerApprovalStatus.REJECTED, 1),
      ],
      [],
      [],
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(prisma.partner.groupBy).toHaveBeenCalledWith({
      by: ['approvalStatus'],
      where: { deletedAt: null },
      orderBy: { approvalStatus: 'asc' },
      _count: { _all: true },
    });
    expect(result.partners).toEqual({
      draft: 2,
      pending: 4,
      approved: 1,
      rejected: 1,
    });
  });

  it('queries the five most recent partners with nulls-last submittedAt ordering', async () => {
    prisma.$transaction.mockResolvedValue([[], [], [], [partnerRow()], []]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(prisma.partner.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null },
        orderBy: [
          { submittedAt: { sort: 'desc', nulls: 'last' } },
          { id: 'desc' },
        ],
        take: 5,
      }),
    );
    expect(result.recentPartners).toEqual([
      {
        id: 'partner-1',
        businessName: 'شرکت نمونه',
        approvalStatus: PartnerApprovalStatus.PENDING,
        city: 'تهران',
        province: 'تهران',
        submittedAt: '2026-08-18T10:00:00.000Z',
        createdAt: '2026-08-18T09:00:00.000Z',
      },
    ]);
  });

  it('maps null submittedAt, city and province on recent partners', async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      [],
      [],
      [
        partnerRow({
          submittedAt: null,
          city: null,
          province: null,
        }),
      ],
      [],
    ]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(result.recentPartners[0]!.submittedAt).toBeNull();
    expect(result.recentPartners[0]!.city).toBeNull();
    expect(result.recentPartners[0]!.province).toBeNull();
  });

  it('queries the eight most recent audit rows with a compact select', async () => {
    prisma.$transaction.mockResolvedValue([[], [], [], [], [auditRow()]]);
    prisma.user.findMany.mockResolvedValue([]);

    await service.getSummary();

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 8,
      }),
    );
    const select = (prisma.auditLog.findMany.mock.calls[0]![0] as { select: Record<string, unknown> })
      .select;
    expect(select).not.toHaveProperty('before');
    expect(select).not.toHaveProperty('after');
    expect(select).not.toHaveProperty('ipAddress');
    expect(select).toHaveProperty('id', true);
    expect(select).toHaveProperty('userId', true);
    expect(select).toHaveProperty('action', true);
    expect(select).toHaveProperty('entity', true);
    expect(select).toHaveProperty('entityId', true);
    expect(select).toHaveProperty('createdAt', true);
  });

  it('resolves the actor for an existing user', async () => {
    prisma.$transaction.mockResolvedValue([[], [], [], [], [auditRow()]]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        mobile: '+989123456789',
        profile: { firstName: 'علی', lastName: 'احمدی' },
      },
    ]);

    const result = await service.getSummary();

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['user-1'] } },
      select: {
        id: true,
        mobile: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
    expect(result.recentAudit[0]!.userId).toBe('user-1');
    expect(result.recentAudit[0]!.actor).toEqual({
      id: 'user-1',
      mobile: '+989123456789',
      firstName: 'علی',
      lastName: 'احمدی',
    });
  });

  it('keeps userId and sets actor null when the actor row is missing', async () => {
    prisma.$transaction.mockResolvedValue([[], [], [], [], [auditRow()]]);
    prisma.user.findMany.mockResolvedValue([]);

    const result = await service.getSummary();

    expect(result.recentAudit[0]!.userId).toBe('user-1');
    expect(result.recentAudit[0]!.actor).toBeNull();
  });

  it('resolves a soft-deleted actor normally', async () => {
    prisma.$transaction.mockResolvedValue([[], [], [], [], [auditRow()]]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        mobile: '+989123456789',
        profile: null,
      },
    ]);

    const result = await service.getSummary();

    expect(result.recentAudit[0]!.actor).toEqual({
      id: 'user-1',
      mobile: '+989123456789',
      firstName: null,
      lastName: null,
    });
  });

  it('returns actor null without a user lookup for rows without a userId', async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      [],
      [],
      [],
      [auditRow({ userId: null })],
    ]);

    const result = await service.getSummary();

    expect(result.recentAudit[0]!.actor).toBeNull();
    expect(result.recentAudit[0]!.userId).toBeNull();
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });

  it('does not duplicate actor lookups for repeated userIds', async () => {
    prisma.$transaction.mockResolvedValue([
      [],
      [],
      [],
      [],
      [auditRow(), auditRow({ id: 'audit-2' })],
    ]);
    prisma.user.findMany.mockResolvedValue([
      {
        id: 'user-1',
        mobile: '+989123456789',
        profile: null,
      },
    ]);

    const result = await service.getSummary();

    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['user-1'] } } }),
    );
    expect(result.recentAudit[1]!.actor).toEqual({
      id: 'user-1',
      mobile: '+989123456789',
      firstName: null,
      lastName: null,
    });
  });

  it('never exposes sensitive data in the serialized summary', async () => {
    prisma.$transaction.mockResolvedValue([
      [userGroup(UserStatus.ACTIVE, 1)],
      [roleRow('OPERATOR', 1)],
      [partnerGroup(PartnerApprovalStatus.PENDING, 1)],
      [partnerRow()],
      [auditRow()],
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 'user-1', mobile: '+989123456789', profile: null },
    ]);

    const result = await service.getSummary();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('refreshToken');
    expect(serialized).not.toContain('tokenHash');
    expect(serialized).not.toContain('sessionId');
    expect(serialized).not.toContain('storageKey');
    expect(serialized).not.toContain('nationalId');
    expect(serialized).not.toContain('businessLicenseNo');
    expect(serialized).not.toContain('reviewNotes');
    expect(serialized).not.toContain('before');
    expect(serialized).not.toContain('after');
    expect(serialized).not.toContain('ipAddress');
  });
});