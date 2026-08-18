import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PartnerApprovalStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppRole } from '../src/modules/auth/enums/app-role.enum';
import { RolesService } from '../src/modules/auth/roles/roles.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { UsersService } from '../src/modules/users/users.service';

jest.setTimeout(30_000);

function uniqueMobile(): string {
  return `+989${String(Date.now()).slice(-9)}${Math.floor(Math.random() * 900_000 + 100_000)}`;
}

describe('Admin user read + lifecycle database integration (SS-061/SS-062)', () => {
  let prisma: PrismaService;
  let service: UsersService;
  let tokenService: TokenService;

  const createdMobiles: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    for (const role of Object.values(AppRole)) {
      await prisma.role.upsert({
        where: { name: role },
        update: {},
        create: { name: role },
      });
    }

    const auditService = new AuditService(prisma);
    const jwtSecret = 'integration-test-secret';
    const jwtService = new JwtService({ secret: jwtSecret });
    const configService = new ConfigService({
      JWT_ACCESS_SECRET: jwtSecret,
      JWT_REFRESH_SECRET: jwtSecret,
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '30d',
    });
    tokenService = new TokenService(prisma, jwtService, configService, auditService);
    service = new UsersService(prisma, auditService, new RolesService(prisma));
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: {
        OR: [{ entityId: { in: createdUserIds } }, { userId: { in: createdUserIds } }],
      },
    });
    await prisma.userSession.deleteMany({
      where: { user: { mobile: { in: createdMobiles } } },
    });
    await prisma.user.deleteMany({ where: { mobile: { in: createdMobiles } } });
    await prisma.$disconnect();
  });

  async function createUser(options: {
    mobile: string;
    firstName: string;
    lastName: string;
    status?: UserStatus;
    roles?: AppRole[];
    partner?: { businessName: string; approvalStatus: PartnerApprovalStatus };
  }) {
    const mobile = options.mobile;
    createdMobiles.push(mobile);
    const user = await prisma.user.create({
      data: {
        mobile,
        status: options.status ?? UserStatus.ACTIVE,
        profile: {
          create: {
            firstName: options.firstName,
            lastName: options.lastName,
            ...(options.partner
              ? {
                  partner: {
                    create: {
                      businessName: options.partner.businessName,
                      approvalStatus: options.partner.approvalStatus,
                    },
                  },
                }
              : {}),
          },
        },
      },
      include: { profile: true },
    });
    createdUserIds.push(user.id);

    for (const role of options.roles ?? []) {
      const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role } });
      await prisma.userRole.create({
        data: { userId: user.id, roleId: roleRow.id, assignedBy: user.id },
      });
    }

    return user;
  }

  async function createSessions(userId: string, count: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      await tokenService.createSession(userId, { ipAddress: '10.0.0.1' });
    }
  }

  async function countActiveAdmins(): Promise<number> {
    return prisma.user.count({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roles: { some: { role: { name: AppRole.ADMIN } } },
      },
    });
  }

  async function suspendOtherActiveAdmins(keepIds: string[]): Promise<string[]> {
    const others = await prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        deletedAt: null,
        roles: { some: { role: { name: AppRole.ADMIN } } },
        id: { notIn: keepIds },
      },
      select: { id: true },
    });
    const ids = others.map((admin) => admin.id);
    if (ids.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: UserStatus.SUSPENDED },
      });
    }
    return ids;
  }

  async function restoreSuspendedAdmins(ids: string[]): Promise<void> {
    if (ids.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: ids } },
        data: { status: UserStatus.ACTIVE },
      });
    }
  }

  describe('list', () => {
    it('searches by mobile with a partial, case-insensitive match', async () => {
      // The token must be unique to this test: a bare ms timestamp would be
      // shared by parallel workers in the same millisecond, and their random
      // mobiles would accidentally match the partial search. The random suffix
      // makes a cross-worker collision practically impossible.
      const token = `${String(Date.now()).slice(-8)}${Math.floor(
        Math.random() * 900 + 100,
      )}`;
      const firstMobile = `+9891${token}1`;
      const secondMobile = `+9891${token}2`;
      await createUser({
        mobile: firstMobile,
        firstName: 'علی',
        lastName: 'احمدی',
      });
      await createUser({
        mobile: secondMobile,
        firstName: 'زهرا',
        lastName: 'رضایی',
      });

      const result = await service.list({ search: token });

      expect(result.total).toBe(2);
      const mobiles = result.items.map((item) => item.mobile).sort();
      expect(mobiles).toEqual([firstMobile, secondMobile].sort());
    });

    it('searches by first name', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'محمد',
        lastName: 'کریمی',
      });

      const result = await service.list({ search: 'محمد' });

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items.some((item) => item.profile?.firstName === 'محمد')).toBe(
        true,
      );
    });

    it('searches by last name case-insensitively', async () => {
      const mobile = uniqueMobile();
      await createUser({
        mobile,
        firstName: 'مریم',
        lastName: 'Mohammadi',
      });

      const result = await service.list({ search: 'mohammadi' });

      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.items.some((item) => item.mobile === mobile)).toBe(true);
    });

    it('treats underscore and percent in the search term literally', async () => {
      const literalMobile = uniqueMobile();
      const wildcardMobile = uniqueMobile();
      await createUser({
        mobile: literalMobile,
        firstName: 'سارا',
        lastName: 'میر_احمدی',
      });
      await createUser({
        mobile: wildcardMobile,
        firstName: 'سارا',
        lastName: 'میرXاحمدی',
      });

      const result = await service.list({ search: 'میر_احمدی' });

      expect(result.total).toBe(1);
      expect(result.items[0]!.mobile).toBe(literalMobile);
    });

    it('filters by status', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'حسین',
        lastName: 'نوری',
        status: UserStatus.SUSPENDED,
      });

      const result = await service.list({ status: UserStatus.SUSPENDED });

      expect(result.total).toBeGreaterThanOrEqual(1);
      for (const item of result.items) {
        expect(item.status).toBe(UserStatus.SUSPENDED);
      }
    });

    it('filters by role through the real Role/UserRole join', async () => {
      const mobile = uniqueMobile();
      await createUser({
        mobile,
        firstName: 'نگار',
        lastName: 'جعفری',
        roles: [AppRole.OPERATOR],
      });

      const result = await service.list({ role: AppRole.OPERATOR });

      expect(result.total).toBeGreaterThanOrEqual(1);
      const mine = result.items.find((item) => item.mobile === mobile);
      expect(mine).toBeDefined();
      expect(mine!.roles).toContain(AppRole.OPERATOR);
    });

    it('combines search, status and role filters', async () => {
      const mobile = uniqueMobile();
      await createUser({
        mobile,
        firstName: 'فرهاد',
        lastName: 'موسوی',
        status: UserStatus.ACTIVE,
        roles: [AppRole.PARTNER],
      });

      const result = await service.list({
        search: 'فرهاد',
        status: UserStatus.ACTIVE,
        role: AppRole.PARTNER,
      });

      expect(result.total).toBe(1);
      expect(result.items[0]!.mobile).toBe(mobile);
    });

    it('paginates with deterministic ordering', async () => {
      const first = await createUser({
        mobile: uniqueMobile(),
        firstName: 'بهرام',
        lastName: 'صادقی',
      });
      await prisma.user.update({
        where: { id: first.id },
        data: { createdAt: new Date(Date.now() + 60_000) },
      });
      const second = await createUser({
        mobile: uniqueMobile(),
        firstName: 'شیما',
        lastName: 'قاسمی',
      });
      await prisma.user.update({
        where: { id: second.id },
        data: { createdAt: new Date(Date.now() + 120_000) },
      });

      const pageOne = await service.list({ page: 1, limit: 1 });
      const pageTwo = await service.list({ page: 2, limit: 1 });

      expect(pageOne.items).toHaveLength(1);
      expect(pageTwo.items).toHaveLength(1);
      expect(pageOne.items[0]!.id).toBe(second.id);
      expect(pageTwo.items[0]!.id).toBe(first.id);
    });

    it('excludes soft-deleted users', async () => {
      const mobile = uniqueMobile();
      const user = await createUser({
        mobile,
        firstName: 'یاسمن',
        lastName: 'کاظمی',
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      const result = await service.list({ search: 'یاسمن' });

      expect(result.total).toBe(0);
    });

    it('returns a partner summary on list items when present', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'پویا',
        lastName: 'رحیمی',
        roles: [AppRole.PARTNER],
        partner: {
          businessName: 'اکسیر الکترونیک',
          approvalStatus: PartnerApprovalStatus.APPROVED,
        },
      });

      const result = await service.list({ search: 'پویا' });

      expect(result.total).toBe(1);
      expect(result.items[0]!.partner).toMatchObject({
        businessName: 'اکسیر الکترونیک',
        approvalStatus: PartnerApprovalStatus.APPROVED,
      });
    });

    it('never returns sensitive fields', async () => {
      await createUser({
        mobile: uniqueMobile(),
        firstName: 'لیلا',
        lastName: 'حیدری',
      });

      const result = await service.list({ search: 'لیلا' });
      const serialized = JSON.stringify(result);

      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });
  });

  describe('getDetail', () => {
    it('returns the full detail with profile, roles and partner', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'امیر',
        lastName: 'عباسی',
        roles: [AppRole.CUSTOMER, AppRole.PARTNER],
        partner: {
          businessName: 'صنایع پارس',
          approvalStatus: PartnerApprovalStatus.PENDING,
        },
      });

      const result = await service.getDetail(user.id);

      expect(result).toMatchObject({
        id: user.id,
        mobile: user.mobile,
        status: UserStatus.ACTIVE,
        profile: { firstName: 'امیر', lastName: 'عباسی' },
        roles: [
          { name: AppRole.CUSTOMER, assignedAt: expect.any(String) },
          { name: AppRole.PARTNER, assignedAt: expect.any(String) },
        ],
        partner: {
          businessName: 'صنایع پارس',
          approvalStatus: PartnerApprovalStatus.PENDING,
        },
        lastLoginAt: null,
      });
      expect(result.createdAt).toEqual(expect.any(String));
      expect(result.updatedAt).toEqual(expect.any(String));
      expect(JSON.stringify(result)).not.toContain('passwordHash');
      expect(JSON.stringify(result)).not.toContain('refreshToken');
    });

    it('returns a null profile and partner for a profile-less user', async () => {
      const mobile = uniqueMobile();
      createdMobiles.push(mobile);
      const user = await prisma.user.create({
        data: { mobile, status: UserStatus.ACTIVE },
      });

      const result = await service.getDetail(user.id);

      expect(result.profile).toBeNull();
      expect(result.partner).toBeNull();
    });

    it('throws 404 for a missing user', async () => {
      await expect(
        service.getDetail('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 404 for a soft-deleted user', async () => {
      const mobile = uniqueMobile();
      const user = await createUser({
        mobile,
        firstName: 'سارا',
        lastName: 'محمدی',
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      await expect(service.getDetail(user.id)).rejects.toThrow(NotFoundException);
    });
  });

  describe('suspend (SS-062)', () => {
    it('suspends an ACTIVE user, revokes all sessions and audits atomically', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'تعلیق',
        roles: [AppRole.CUSTOMER],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'تعلیق',
        roles: [AppRole.OPERATOR],
      });
      await createSessions(user.id, 2);

      const result = await service.suspendUser(
        user.id,
        actor.id,
        { reason: 'تخلف در فروش' },
        '1.2.3.4',
      );

      expect(result.status).toBe(UserStatus.SUSPENDED);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.status).toBe(UserStatus.SUSPENDED);

      const sessions = await prisma.userSession.findMany({
        where: { userId: user.id },
      });
      expect(sessions).toHaveLength(2);
      for (const session of sessions) {
        expect(session.revokedAt).not.toBeNull();
      }

      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'USER_SUSPENDED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(actor.id);
      const serialized = JSON.stringify(audits[0]);
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('refreshToken');
      expect(serialized).not.toContain('sessionId');
    });

    it('rolls back status and session revocation when the audit write fails', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'رولبک',
        roles: [AppRole.CUSTOMER],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'رولبک',
        roles: [AppRole.OPERATOR],
      });
      await createSessions(user.id, 1);

      const realTransaction = prisma.$transaction.bind(prisma);
      const failingPrisma = new Proxy(prisma, {
        get(target, prop) {
          if (prop === '$transaction') {
            return async (
              operation: unknown,
              options?: unknown,
            ): Promise<unknown> => {
              if (typeof operation === 'function') {
                return realTransaction(
                  (tx: unknown) => {
                    const proxiedTx = new Proxy(tx as object, {
                      get(txTarget, txProp) {
                        if (txProp === 'auditLog') {
                          return new Proxy(
                            (txTarget as Record<string, unknown>).auditLog as object,
                            {
                              get(auditTarget, auditProp) {
                                if (auditProp === 'create') {
                                  return async () => {
                                    throw new Error('forced audit failure');
                                  };
                                }
                                return Reflect.get(auditTarget, auditProp, auditTarget);
                              },
                            },
                          );
                        }
                        return Reflect.get(txTarget, txProp, txTarget);
                      },
                    });
                    return (operation as (client: unknown) => Promise<unknown>)(
                      proxiedTx,
                    );
                  },
                  options as never,
                );
              }
              return realTransaction(operation as never, options as never);
            };
          }
          return Reflect.get(target, prop, target);
        },
      });

      const failingService = new UsersService(
        failingPrisma as unknown as PrismaService,
        new AuditService(prisma),
        new RolesService(prisma),
      );

      await expect(
        failingService.suspendUser(user.id, actor.id, {}, '1.2.3.4'),
      ).rejects.toThrow('forced audit failure');

      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.status).toBe(UserStatus.ACTIVE);
      const sessions = await prisma.userSession.findMany({
        where: { userId: user.id },
      });
      expect(sessions[0]!.revokedAt).toBeNull();
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'USER_SUSPENDED' },
      });
      expect(audits).toHaveLength(0);
    });

    it('rejects an OPERATOR acting on an ADMIN target with 403', async () => {
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'هدف',
        roles: [AppRole.ADMIN],
      });
      const operator = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'هدف',
        roles: [AppRole.OPERATOR],
      });

      await expect(
        service.suspendUser(admin.id, operator.id, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows an ADMIN to suspend another ADMIN when another active ADMIN remains', async () => {
      const target = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'الف',
        roles: [AppRole.ADMIN],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'ب',
        roles: [AppRole.ADMIN],
      });

      const suspended = await service.suspendUser(target.id, actor.id, {});

      expect(suspended.status).toBe(UserStatus.SUSPENDED);
      expect(await countActiveAdmins()).toBeGreaterThanOrEqual(1);
    });

    it('blocks suspending the sole active ADMIN', async () => {
      const target = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'تنها',
        roles: [AppRole.ADMIN],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'بازیگر',
        roles: [AppRole.ADMIN],
      });
      // Suspend the actor directly so only the target remains an active ADMIN.
      // The actor still holds the ADMIN role, so it passes the OPERATOR-vs-ADMIN
      // check and reaches the last-active-ADMIN guard.
      await prisma.user.update({
        where: { id: actor.id },
        data: { status: UserStatus.SUSPENDED },
      });
      const others = await suspendOtherActiveAdmins([target.id]);

      try {
        await expect(
          service.suspendUser(target.id, actor.id, {}),
        ).rejects.toThrow(ConflictException);
        const stored = await prisma.user.findUnique({ where: { id: target.id } });
        expect(stored?.status).toBe(UserStatus.ACTIVE);
      } finally {
        await restoreSuspendedAdmins(others);
      }
    });
  });

  describe('unsuspend (SS-062)', () => {
    it('transitions SUSPENDED → ACTIVE and writes USER_UNSUSPENDED', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'رفع',
        status: UserStatus.SUSPENDED,
        roles: [AppRole.CUSTOMER],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'رفع',
        roles: [AppRole.OPERATOR],
      });

      const result = await service.unsuspendUser(user.id, actor.id, '1.2.3.4');

      expect(result.status).toBe(UserStatus.ACTIVE);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'USER_UNSUSPENDED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(actor.id);
      expect(JSON.stringify(audits[0])).not.toContain('passwordHash');
      expect(JSON.stringify(audits[0])).not.toContain('refreshToken');
    });

    it('does not restore old sessions on unsuspend', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'رفع۲',
        status: UserStatus.SUSPENDED,
        roles: [AppRole.CUSTOMER],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'رفع۲',
        roles: [AppRole.OPERATOR],
      });
      await createSessions(user.id, 1);
      await prisma.userSession.updateMany({
        where: { userId: user.id },
        data: { revokedAt: new Date() },
      });

      await service.unsuspendUser(user.id, actor.id);

      const sessions = await prisma.userSession.findMany({
        where: { userId: user.id },
      });
      expect(sessions[0]!.revokedAt).not.toBeNull();
    });
  });

  describe('unlock (SS-062)', () => {
    it('transitions LOCKED → ACTIVE and writes USER_UNLOCKED', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'بازشدن',
        status: UserStatus.LOCKED,
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'بازشدن',
        roles: [AppRole.ADMIN],
      });

      const result = await service.unlockUser(user.id, admin.id, '1.2.3.4');

      expect(result.status).toBe(UserStatus.ACTIVE);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'USER_UNLOCKED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(admin.id);
      expect(JSON.stringify(audits[0])).not.toContain('passwordHash');
      expect(JSON.stringify(audits[0])).not.toContain('refreshToken');
    });

    it('rejects a SUSPENDED target with 409', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'بازشدن۲',
        status: UserStatus.SUSPENDED,
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'بازشدن۲',
        roles: [AppRole.ADMIN],
      });

      await expect(
        service.unlockUser(user.id, admin.id),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('soft-deleted lifecycle targets (SS-062)', () => {
    it('returns 404 for suspend, unsuspend and unlock', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'حذف',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'حذف',
        roles: [AppRole.ADMIN],
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      await expect(
        service.suspendUser(user.id, admin.id, {}),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.unsuspendUser(user.id, admin.id),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.unlockUser(user.id, admin.id),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('concurrent lifecycle changes (SS-062)', () => {
    it('allows exactly one winner of two concurrent suspensions', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'همزمان',
        roles: [AppRole.CUSTOMER],
      });
      const actor1 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'یک',
        roles: [AppRole.OPERATOR],
      });
      const actor2 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'دو',
        roles: [AppRole.OPERATOR],
      });

      const results = await Promise.allSettled([
        service.suspendUser(user.id, actor1.id, {}),
        service.suspendUser(user.id, actor2.id, {}),
      ]);

      const fulfilled = results.filter((result) => result.status === 'fulfilled');
      const rejected = results.filter((result) => result.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        ConflictException,
      );

      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.status).toBe(UserStatus.SUSPENDED);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'USER_SUSPENDED' },
      });
      expect(audits).toHaveLength(1);
    });

    it('lets exactly one concurrent suspension of the two remaining active ADMINS win', async () => {
      const targetA = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'همزمان الف',
        roles: [AppRole.ADMIN],
      });
      const targetB = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'همزمان ب',
        roles: [AppRole.ADMIN],
      });
      // Both actors hold the ADMIN role (so the OPERATOR-vs-ADMIN check passes)
      // but are not ACTIVE, so they do not count towards the active-ADMIN total
      // and the two targets are the only remaining active ADMINS. This is the
      // race the SELECT ... FOR UPDATE guard must serialize: without it both
      // transactions would see two active ADMINS and both would commit, leaving
      // zero. With the lock the loser re-reads after the winner commits and
      // returns 409.
      const actor1 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'بازیگر الف',
        roles: [AppRole.ADMIN],
      });
      const actor2 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'بازیگر ب',
        roles: [AppRole.ADMIN],
      });
      await prisma.user.updateMany({
        where: { id: { in: [actor1.id, actor2.id] } },
        data: { status: UserStatus.SUSPENDED },
      });
      const others = await suspendOtherActiveAdmins([targetA.id, targetB.id]);

      try {
        const results = await Promise.allSettled([
          service.suspendUser(targetA.id, actor1.id, {}),
          service.suspendUser(targetB.id, actor2.id, {}),
        ]);

        const fulfilled = results.filter(
          (result) => result.status === 'fulfilled',
        );
        const rejected = results.filter(
          (result) => result.status === 'rejected',
        );
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
          ConflictException,
        );

        const activeCount = await countActiveAdmins();
        expect(activeCount).toBeGreaterThanOrEqual(1);

        const suspendedAudits = await prisma.auditLog.findMany({
          where: {
            action: 'USER_SUSPENDED',
            entityId: { in: [targetA.id, targetB.id] },
          },
        });
        expect(suspendedAudits).toHaveLength(1);
      } finally {
        await restoreSuspendedAdmins(others);
      }
    });
  });

  describe('refresh security after suspension (SS-062)', () => {
    it('rejects refresh once the account is suspended', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'توکن',
        roles: [AppRole.CUSTOMER],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'توکن',
        roles: [AppRole.OPERATOR],
      });

      const tokens = await tokenService.createSession(user.id, {
        ipAddress: '10.0.0.1',
      });

      await service.suspendUser(user.id, actor.id, {});

      await expect(
        tokenService.refreshSession(tokens.refreshToken, {
          ipAddress: '10.0.0.1',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('listRoles (SS-063)', () => {
    it('returns every seeded role with read-only permission names', async () => {
      const roles = await service.listRoles();

      const names = roles.map((role) => role.name).sort();
      expect(names).toEqual(
        ['CUSTOMER', 'PARTNER', 'OPERATOR', 'ADMIN'].sort(),
      );
      for (const role of roles) {
        expect(Array.isArray(role.permissions)).toBe(true);
        expect(role).toHaveProperty('id');
        expect(role).toHaveProperty('description');
      }
      const serialized = JSON.stringify(roles);
      expect(serialized).not.toContain('passwordHash');
    });
  });

  describe('assignRole (SS-063)', () => {
    it('assigns a role and writes exactly one ROLE_ASSIGNED audit', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'نقش',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'نقش',
        roles: [AppRole.ADMIN],
      });

      const result = await service.assignRole(
        user.id,
        AppRole.OPERATOR,
        admin.id,
        '1.2.3.4',
      );

      expect(result.roles.some((role) => role.name === AppRole.OPERATOR)).toBe(
        true,
      );
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'ROLE_ASSIGNED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(admin.id);
      expect(audits[0]!.before).toEqual({ role: null });
      expect(audits[0]!.after).toEqual({ role: AppRole.OPERATOR });
      expect(JSON.stringify(audits[0])).not.toContain('passwordHash');
    });

    it('is idempotent: a duplicate assignment creates no row and no audit', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'تکراری',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'تکراری',
        roles: [AppRole.ADMIN],
      });

      await service.assignRole(user.id, AppRole.OPERATOR, admin.id);
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: AppRole.OPERATOR },
      });
      const before = await prisma.userRole.count({
        where: { userId: user.id, roleId: roleRow.id },
      });
      expect(before).toBe(1);

      const result = await service.assignRole(
        user.id,
        AppRole.OPERATOR,
        admin.id,
      );

      const after = await prisma.userRole.count({
        where: { userId: user.id, roleId: roleRow.id },
      });
      expect(after).toBe(1);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'ROLE_ASSIGNED' },
      });
      expect(audits).toHaveLength(1);
      expect(result.roles.filter((role) => role.name === AppRole.OPERATOR)).toHaveLength(1);
    });

    it('preserves existing roles when assigning an additional role', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'جمعی',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'جمعی',
        roles: [AppRole.ADMIN],
      });

      await service.assignRole(user.id, AppRole.PARTNER, admin.id);
      const result = await service.assignRole(user.id, AppRole.OPERATOR, admin.id);

      const names = result.roles.map((role) => role.name).sort();
      expect(names).toEqual([AppRole.CUSTOMER, AppRole.PARTNER, AppRole.OPERATOR].sort());
    });

    it('allows assigning the ADMIN role to another user', async () => {
      const target = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'مدیرجدید',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'دهنده',
        roles: [AppRole.ADMIN],
      });

      const result = await service.assignRole(target.id, AppRole.ADMIN, admin.id);

      expect(result.roles.some((role) => role.name === AppRole.ADMIN)).toBe(true);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: target.id, action: 'ROLE_ASSIGNED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.after).toEqual({ role: AppRole.ADMIN });
    });

    it('allows assigning roles to SUSPENDED and LOCKED targets', async () => {
      const suspended = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'معلق',
        status: UserStatus.SUSPENDED,
        roles: [AppRole.CUSTOMER],
      });
      const locked = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'قفل',
        status: UserStatus.LOCKED,
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'وضعیت',
        roles: [AppRole.ADMIN],
      });

      const suspendedResult = await service.assignRole(
        suspended.id,
        AppRole.OPERATOR,
        admin.id,
      );
      const lockedResult = await service.assignRole(
        locked.id,
        AppRole.PARTNER,
        admin.id,
      );

      expect(
        suspendedResult.roles.some((role) => role.name === AppRole.OPERATOR),
      ).toBe(true);
      expect(
        lockedResult.roles.some((role) => role.name === AppRole.PARTNER),
      ).toBe(true);
    });

    it('returns 404 for a soft-deleted target', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'نقشحذف',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'نقشحذف',
        roles: [AppRole.ADMIN],
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { deletedAt: new Date() },
      });

      await expect(
        service.assignRole(user.id, AppRole.OPERATOR, admin.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids self role modification with 403', async () => {
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'خودنقش',
        roles: [AppRole.ADMIN],
      });

      await expect(
        service.assignRole(admin.id, AppRole.OPERATOR, admin.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-ADMIN actor with 403', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'اجازه',
        roles: [AppRole.CUSTOMER],
      });
      const operator = await createUser({
        mobile: uniqueMobile(),
        firstName: 'اپراتور',
        lastName: 'اجازه',
        roles: [AppRole.OPERATOR],
      });

      await expect(
        service.assignRole(user.id, AppRole.OPERATOR, operator.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rolls back the assignment when the audit write fails', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'نقشرولبک',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'نقشرولبک',
        roles: [AppRole.ADMIN],
      });
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: AppRole.OPERATOR },
      });

      const realTransaction = prisma.$transaction.bind(prisma);
      const failingPrisma = new Proxy(prisma, {
        get(target, prop) {
          if (prop === '$transaction') {
            return async (
              operation: unknown,
              options?: unknown,
            ): Promise<unknown> => {
              if (typeof operation === 'function') {
                return realTransaction(
                  (tx: unknown) => {
                    const proxiedTx = new Proxy(tx as object, {
                      get(txTarget, txProp) {
                        if (txProp === 'auditLog') {
                          return new Proxy(
                            (txTarget as Record<string, unknown>).auditLog as object,
                            {
                              get(auditTarget, auditProp) {
                                if (auditProp === 'create') {
                                  return async () => {
                                    throw new Error('forced audit failure');
                                  };
                                }
                                return Reflect.get(auditTarget, auditProp, auditTarget);
                              },
                            },
                          );
                        }
                        return Reflect.get(txTarget, txProp, txTarget);
                      },
                    });
                    return (operation as (client: unknown) => Promise<unknown>)(
                      proxiedTx,
                    );
                  },
                  options as never,
                );
              }
              return realTransaction(operation as never, options as never);
            };
          }
          return Reflect.get(target, prop, target);
        },
      });

      const failingService = new UsersService(
        failingPrisma as unknown as PrismaService,
        new AuditService(prisma),
        new RolesService(prisma),
      );

      await expect(
        failingService.assignRole(user.id, AppRole.OPERATOR, admin.id, '1.2.3.4'),
      ).rejects.toThrow('forced audit failure');

      const rows = await prisma.userRole.count({
        where: { userId: user.id, roleId: roleRow.id },
      });
      expect(rows).toBe(0);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'ROLE_ASSIGNED' },
      });
      expect(audits).toHaveLength(0);
    });
  });

  describe('removeRole (SS-063)', () => {
    it('removes a role and writes exactly one ROLE_REMOVED audit', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'حذفنقش',
        roles: [AppRole.CUSTOMER, AppRole.OPERATOR],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'حذفنقش',
        roles: [AppRole.ADMIN],
      });

      const result = await service.removeRole(
        user.id,
        AppRole.OPERATOR,
        admin.id,
        '1.2.3.4',
      );

      expect(result.roles.some((role) => role.name === AppRole.OPERATOR)).toBe(
        false,
      );
      expect(result.roles.some((role) => role.name === AppRole.CUSTOMER)).toBe(
        true,
      );
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'ROLE_REMOVED' },
      });
      expect(audits).toHaveLength(1);
      expect(audits[0]!.userId).toBe(admin.id);
      expect(audits[0]!.before).toEqual({ role: AppRole.OPERATOR });
      expect(audits[0]!.after).toEqual({ role: null });
      expect(JSON.stringify(audits[0])).not.toContain('passwordHash');
    });

    it('treats removing an already-absent role as a no-op with no audit', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'حذفغایب',
        roles: [AppRole.CUSTOMER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'حذفغایب',
        roles: [AppRole.ADMIN],
      });

      const result = await service.removeRole(
        user.id,
        AppRole.OPERATOR,
        admin.id,
      );

      expect(result.roles.some((role) => role.name === AppRole.OPERATOR)).toBe(
        false,
      );
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'ROLE_REMOVED' },
      });
      expect(audits).toHaveLength(0);
    });

    it('forbids ADMIN-role removal with 403', async () => {
      const target = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'مدیرحذف',
        roles: [AppRole.ADMIN],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'مدیرحذف۲',
        roles: [AppRole.ADMIN],
      });

      await expect(
        service.removeRole(target.id, AppRole.ADMIN, admin.id),
      ).rejects.toThrow(ForbiddenException);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: target.id, action: 'ROLE_REMOVED' },
      });
      expect(audits).toHaveLength(0);
    });

    it('forbids self role modification with 403', async () => {
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'خودحذف',
        roles: [AppRole.ADMIN],
      });

      await expect(
        service.removeRole(admin.id, AppRole.OPERATOR, admin.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows removing a role from a suspended or locked ADMIN target', async () => {
      const suspendedAdmin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'معلق',
        status: UserStatus.SUSPENDED,
        roles: [AppRole.ADMIN, AppRole.OPERATOR],
      });
      const lockedAdmin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'قفل',
        status: UserStatus.LOCKED,
        roles: [AppRole.ADMIN, AppRole.PARTNER],
      });
      const admin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'غیرفعال',
        roles: [AppRole.ADMIN],
      });

      const suspendedResult = await service.removeRole(
        suspendedAdmin.id,
        AppRole.OPERATOR,
        admin.id,
      );
      const lockedResult = await service.removeRole(
        lockedAdmin.id,
        AppRole.PARTNER,
        admin.id,
      );

      expect(
        suspendedResult.roles.some((role) => role.name === AppRole.OPERATOR),
      ).toBe(false);
      expect(
        suspendedResult.roles.some((role) => role.name === AppRole.ADMIN),
      ).toBe(true);
      expect(
        lockedResult.roles.some((role) => role.name === AppRole.PARTNER),
      ).toBe(false);
      expect(lockedResult.roles.some((role) => role.name === AppRole.ADMIN)).toBe(
        true,
      );
    });

    it('never lets the sole active ADMIN lose the ADMIN role through any path', async () => {
      const target = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'تنهانقش',
        roles: [AppRole.ADMIN],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'تنهانقشبازیگر',
        roles: [AppRole.ADMIN],
      });
      await prisma.user.update({
        where: { id: actor.id },
        data: { status: UserStatus.SUSPENDED },
      });
      const others = await suspendOtherActiveAdmins([target.id]);

      try {
        await expect(
          service.removeRole(target.id, AppRole.ADMIN, actor.id),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.removeRole(target.id, AppRole.OPERATOR, target.id),
        ).rejects.toThrow(ForbiddenException);
        await expect(
          service.assignRole(target.id, AppRole.OPERATOR, target.id),
        ).rejects.toThrow(ForbiddenException);

        const stored = await prisma.user.findUnique({
          where: { id: target.id },
          select: { status: true },
        });
        expect(stored?.status).toBe(UserStatus.ACTIVE);
        expect(await countActiveAdmins()).toBeGreaterThanOrEqual(1);
      } finally {
        await restoreSuspendedAdmins(others);
      }
    });
  });

  describe('concurrent role mutations (SS-063)', () => {
    it('lets exactly one of two concurrent duplicate assignments win', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'نقشهمزمان',
        roles: [AppRole.CUSTOMER],
      });
      const actor1 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'نقشهمزمان۱',
        roles: [AppRole.ADMIN],
      });
      const actor2 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'نقشهمزمان۲',
        roles: [AppRole.ADMIN],
      });
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: AppRole.OPERATOR },
      });

      const results = await Promise.allSettled([
        service.assignRole(user.id, AppRole.OPERATOR, actor1.id),
        service.assignRole(user.id, AppRole.OPERATOR, actor2.id),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(2);

      const rows = await prisma.userRole.count({
        where: { userId: user.id, roleId: roleRow.id },
      });
      expect(rows).toBe(1);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'ROLE_ASSIGNED' },
      });
      expect(audits).toHaveLength(1);
    });

    it('lets exactly one of two concurrent duplicate removals win', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'حذفهمزمان',
        roles: [AppRole.CUSTOMER, AppRole.OPERATOR],
      });
      const actor1 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'حذفهمزمان۱',
        roles: [AppRole.ADMIN],
      });
      const actor2 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'حذفهمزمان۲',
        roles: [AppRole.ADMIN],
      });
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: AppRole.OPERATOR },
      });

      const results = await Promise.allSettled([
        service.removeRole(user.id, AppRole.OPERATOR, actor1.id),
        service.removeRole(user.id, AppRole.OPERATOR, actor2.id),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(2);

      const rows = await prisma.userRole.count({
        where: { userId: user.id, roleId: roleRow.id },
      });
      expect(rows).toBe(0);
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id, action: 'ROLE_REMOVED' },
      });
      expect(audits).toHaveLength(1);
    });

    it('leaves a consistent final state when assignment races removal', async () => {
      const user = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'نقشرقابت',
        roles: [AppRole.CUSTOMER],
      });
      const actor1 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'نقشرقابت۱',
        roles: [AppRole.ADMIN],
      });
      const actor2 = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'نقشرقابت۲',
        roles: [AppRole.ADMIN],
      });
      const roleRow = await prisma.role.findUniqueOrThrow({
        where: { name: AppRole.OPERATOR },
      });

      const results = await Promise.allSettled([
        service.assignRole(user.id, AppRole.OPERATOR, actor1.id),
        service.removeRole(user.id, AppRole.OPERATOR, actor2.id),
      ]);

      expect(
        results.filter((result) => result.status === 'fulfilled'),
      ).toHaveLength(2);

      const rows = await prisma.userRole.count({
        where: { userId: user.id, roleId: roleRow.id },
      });
      const audits = await prisma.auditLog.findMany({
        where: { entityId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      const roleAudits = audits.filter(
        (audit) =>
          audit.action === 'ROLE_ASSIGNED' || audit.action === 'ROLE_REMOVED',
      );

      expect(rows).toBeLessThanOrEqual(1);
      if (rows === 1) {
        expect(roleAudits[roleAudits.length - 1]!.action).toBe('ROLE_ASSIGNED');
      } else if (roleAudits.length > 0) {
        expect(roleAudits[roleAudits.length - 1]!.action).toBe('ROLE_REMOVED');
      }
    });

    it('keeps the last-active-ADMIN invariant intact when ADMIN assignment races SS-062 suspension', async () => {
      const target = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'رقابتمعلق',
        roles: [AppRole.ADMIN],
      });
      const actor = await createUser({
        mobile: uniqueMobile(),
        firstName: 'مدیر',
        lastName: 'رقابتمعلقبازیگر',
        roles: [AppRole.ADMIN],
      });
      const newAdmin = await createUser({
        mobile: uniqueMobile(),
        firstName: 'تست',
        lastName: 'رقابتمعلقجدید',
        roles: [AppRole.CUSTOMER],
      });
      const others = await suspendOtherActiveAdmins([target.id, actor.id]);

      try {
        await Promise.allSettled([
          service.suspendUser(target.id, actor.id, {}),
          service.assignRole(newAdmin.id, AppRole.ADMIN, actor.id),
        ]);

        expect(await countActiveAdmins()).toBeGreaterThanOrEqual(1);
      } finally {
        await restoreSuspendedAdmins(others);
      }
    });
  });
});